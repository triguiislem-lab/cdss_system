import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search/suggestions')
  suggestions(@Query('query') query?: string) {
    return this.searchService.suggestions(query);
  }

  @Get('search/stats')
  stats(@Query('query') query?: string) {
    return this.searchService.stats(query);
  }

  @Get('articles/search')
  articleSearch(
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('articleType') articleType?: string,
  ) {
    return this.searchService.articleSearch({
      query,
      page,
      limit,
      sortBy,
      dateFrom,
      dateTo,
      articleType,
    });
  }

  @Get('articles/:id')
  article(@Param('id') id: string) {
    return this.searchService.article(id);
  }
}
