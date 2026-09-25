import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminService } from './admin.service';
import { ResetDto } from './reset.dto';

/** Test-only routes (requirement 07). Loaded only when ENABLE_ADMIN=true, see admin.module.ts. */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('reset')
  @HttpCode(HttpStatus.OK) // resets state, creates nothing
  reset(@Body() dto: ResetDto) {
    return this.admin.reset(dto);
  }
}
