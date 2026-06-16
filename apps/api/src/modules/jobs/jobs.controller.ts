import { Controller, Get, Post, Delete, Param, Body, Query, HttpCode, HttpStatus, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('岗位管理')
@ApiBearerAuth('JWT-auth')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: '创建岗位' })
  create(@CurrentUser('sub') userId: string, @Body() dto: { title: string; company?: string; rawText: string; sourceUrl?: string }) {
    return this.jobsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取岗位列表' })
  findAll(@CurrentUser('sub') userId: string, @Query('search') search?: string) {
    return this.jobsService.findAll(userId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取岗位详情' })
  findOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.jobsService.findOne(userId, id);
  }

  @Post('fetch-url')
  @ApiOperation({ summary: '从 URL 抓取 JD 内容' })
  async fetchFromUrl(@Body('url') url: string) {
    if (!url) throw new NotFoundException('请提供 URL');
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      });
      const html = await res.text();

      // 检测是否被反爬拦截
      if (html.includes('请稍候') || html.includes('验证') || html.includes('安全') || html.length < 500) {
        return { title: '', company: '', rawText: '', notice: '该网站有反爬保护，请手动复制粘贴 JD 内容' };
      }

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, '').replace(/\s*\|\s*BOSS直聘.*$/, '').trim() : '';
      const bodyText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/gm, '').slice(0, 5000).trim();
      return { title: title || '未知职位', company: '', rawText: bodyText };
    } catch {
      throw new InternalServerErrorException('抓取失败，请手动粘贴 JD 内容');
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除岗位' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.jobsService.remove(userId, id);
  }
}
