import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule — 用户管理模块 (供 Auth 模块之外的用户操作)
 *
 * 注意: 用户注册/登录在 AuthModule。
 * 此模块仅处理用户个人资料更新、偏好设置等。
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
