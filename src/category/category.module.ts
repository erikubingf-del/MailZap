import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { LlmModule } from '../llm/llm.module';

@Module({
    imports: [LlmModule],
    providers: [CategoryService],
    exports: [CategoryService],
})
export class CategoryModule { }
