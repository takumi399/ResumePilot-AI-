import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserInfoDto } from '../auth/dto/auth-response.dto';

/**
 * UsersService — 用户管理服务
 *
 * 提供用户个人资料的读取和更新。
 * 认证相关操作 (注册/登录/Token) 在 AuthService 中。
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 通过 ID 获取用户公开信息
   */
  async findById(userId: string): Promise<UserInfoDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
