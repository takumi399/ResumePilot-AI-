import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserInfoDto } from '../auth/dto/auth-response.dto';

/**
 * UsersController — 用户管理端点
 *
 * 所有端点需要认证 (全局 JwtAuthGuard 自动保护)
 */
@ApiTags('用户')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: '获取用户个人资料' })
  async getProfile(@CurrentUser('sub') userId: string): Promise<UserInfoDto> {
    return this.usersService.findById(userId);
  }
}
