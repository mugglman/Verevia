import { Controller, Get, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { RelationshipsService } from "./relationships.service";

/**
 * SELF-scoped, not admin-scoped: any authenticated tenant member may call
 * this — it only ever returns the CALLER's own verified guardian
 * children (Phase 6, sections 17/19/28), never anyone else's. This is
 * what apps/web/src/app/meine-kinder/page.tsx uses to give a guardian
 * without any RBAC role something to actually see in the browser.
 */
@Controller({ path: "me/children", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class MyChildrenController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Get()
  list() {
    return this.relationshipsService.listMyChildren();
  }
}
