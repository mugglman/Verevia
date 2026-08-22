import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { MyChildrenController } from "./my-children.controller";
import { RelationshipsController } from "./relationships.controller";
import { RelationshipsService } from "./relationships.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [RelationshipsController, MyChildrenController],
  providers: [RelationshipsService],
})
export class RelationshipsModule {}
