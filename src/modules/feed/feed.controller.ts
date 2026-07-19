import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FeedService } from './feed.service';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  list(@CurrentUser() user: JwtPayload, @Query('page') page?: string) {
    return this.feed.feed(parseInt(page ?? '1', 10), 20, user.sub);
  }

  @Get('trending')
  trending() {
    return this.feed.trending();
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(@CurrentUser() user: JwtPayload, @Body() body: { body?: string; imageUrl?: string }) {
    return this.feed.createPost(user.sub, body.body, body.imageUrl);
  }

  @Post('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  like(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.feed.like(id, user.sub);
  }

  @Get('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listComments(@Param('id') id: string) {
    return this.feed.listComments(id);
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  comment(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { body: string }) {
    return this.feed.comment(id, user.sub, body.body);
  }

  @Post('posts/:id/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  share(@Param('id') id: string) {
    return this.feed.share(id);
  }
}
