import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponseDto,
  RefreshResponseDto,
  LogoutResponseDto,
  UserInfoDto,
} from './dto/auth-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { JwtPayload } from './strategies/jwt.strategy';
import { RefreshTokenPayload } from './strategies/jwt-refresh.strategy';

/**
 * AuthController — 认证控制器
 *
 * 端点设计原则:
 *   - 所有认证端点使用 POST (而非 GET/PUT)，符合安全最佳实践
 *   - /register 和 /login 是公开端点 (@Public())
 *   - /refresh 使用独立的 JwtRefreshGuard (Cookie 验证)
 *   - /me 使用全局 JwtAuthGuard (Bearer Token 验证)
 *   - Refresh Token 通过 HttpOnly Cookie 传递，不在 JSON 响应中暴露
 *
 * Cookie 安全配置:
 *   httpOnly: true    → JS 无法读取 (XSS 防护)
 *   secure: true      → 仅 HTTPS 传输 (生产环境)
 *   sameSite: 'lax'   → 防止 CSRF 攻击
 *   path: '/api/v1/auth/refresh' → 仅在刷新端点发送 (最小化原则)
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // ========================================================================
  // POST /auth/register
  // ========================================================================
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '用户注册', description: '创建新账户并自动登录' })
  @ApiResponse({ status: 201, description: '注册成功', type: AuthResponseDto })
  @ApiResponse({ status: 409, description: '邮箱已被注册' })
  @ApiResponse({ status: 422, description: '输入数据校验失败' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.authService.register(dto) as any;

    // 设置 Refresh Token HttpOnly Cookie
    this.setRefreshTokenCookie(response, result.refreshToken);

    // 返回时剥离 refreshToken + accessJti (已在 Cookie 中)
    const { refreshToken: _, accessJti: __, ...safeResult } = result;
    return safeResult;
  }

  // ========================================================================
  // POST /auth/login
  // ========================================================================
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录', description: '邮箱 + 密码登录' })
  @ApiResponse({ status: 200, description: '登录成功', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: '邮箱或密码错误' })
  @ApiResponse({ status: 423, description: '账户已锁定' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.authService.login(dto, ipAddress, userAgent) as any;

    this.setRefreshTokenCookie(response, result.refreshToken);

    const { refreshToken: _, accessJti: __, ...safeResult } = result;
    return safeResult;
  }

  // ========================================================================
  // POST /auth/refresh
  // ========================================================================
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新 Token', description: '使用 Refresh Token 获取新的 Token 对' })
  @ApiResponse({ status: 200, description: 'Token 刷新成功', type: RefreshResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh Token 无效或已过期' })
  async refresh(
    @CurrentUser() refreshUser: { userId: string; jti: string; sessionId: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.authService.refreshToken(
      refreshUser.sessionId,
      refreshUser.userId,
      refreshUser.jti,
    ) as any;

    this.setRefreshTokenCookie(response, result.refreshToken);

    const { refreshToken: _, ...safeResult } = result;
    return safeResult;
  }

  // ========================================================================
  // POST /auth/logout
  // ========================================================================
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户登出', description: '撤销 Refresh Token + 黑名单 Access Token' })
  @ApiResponse({ status: 200, description: '登出成功', type: LogoutResponseDto })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponseDto> {
    // [FIXED #2] 提取 access token JTI 用于加入黑名单
    const accessTokenJti = user.jti;

    // 从 Cookie 中提取 Refresh Token 并撤销
    const refreshTokenRaw = request.cookies?.['refresh_token'];
    if (refreshTokenRaw) {
      await this.authService.logoutByRefreshToken(
        user.sub,
        refreshTokenRaw,
        accessTokenJti,  // 传入 JTI 确保 Access Token 也被撤销
      );
    }

    // 清除 Refresh Token Cookie
    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/api/v1/auth',
      domain: process.env.COOKIE_DOMAIN || undefined,
    });

    this.logger.log(`用户登出: ${user.email} (jti: ${accessTokenJti})`);

    return {
      success: true,
      message: '已成功登出',
    };
  }

  // ========================================================================
  // GET /auth/me
  // ========================================================================
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息', description: '返回当前登录用户的详细信息' })
  @ApiResponse({ status: 200, description: '成功', type: UserInfoDto })
  @ApiResponse({ status: 401, description: '未登录或 Token 已过期' })
  async getMe(@CurrentUser('sub') userId: string): Promise<UserInfoDto> {
    return this.authService.getCurrentUser(userId);
  }

  // ========================================================================
  // 私有方法: 设置 Refresh Token Cookie
  // ========================================================================

  /**
   * 设置 HttpOnly Refresh Token Cookie
   *
   * 安全配置说明:
   *   httpOnly: true     — JS 无法通过 document.cookie 读取，防止 XSS 窃取
   *   secure: true       — 仅在 HTTPS 连接下传输 (生产环境)
   *   sameSite: 'lax'    — 允许同站导航携带 Cookie，阻止跨站请求
   *                         (lax 比 strict 更实用: 用户从邮件链接跳转时仍可携带)
   *   path: '/api/v1/auth/refresh' — 仅在刷新端点发送，减少暴露面
   *   maxAge: 7 天        — 与 Refresh Token 过期时间一致
   */
  private setRefreshTokenCookie(response: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN || undefined,
    });
  }
}
