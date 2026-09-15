import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto";
import { SetTaskStatusDto } from "./dto/set-task-status.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { TasksService } from "./tasks.service";

@Controller({ path: "tasks", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Query() query: ListTasksQueryDto) {
    return this.tasksService.list(query);
  }

  // Must come before ":id" — NestJS matches GET routes in declaration
  // order, and ":id" would otherwise swallow this literal path.
  @Get("creatable-scopes")
  listCreatableScopes() {
    return this.tasksService.listCreatableScopes();
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.tasksService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Patch(":id/status")
  setStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetTaskStatusDto) {
    return this.tasksService.setStatus(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.tasksService.remove(id);
  }
}
