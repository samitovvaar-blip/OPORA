// Реестр модулей для подключения из других репозиториев.
// Сейчас: npm-пакеты (@opora/module-*). Интерфейс совместим с будущим Module Federation.
import type { ComponentType } from "react";

export interface OporaModule {
  id: string;
  title: string;
  icon: string;
  path: string;
  component: ComponentType;
  adminOnly?: boolean;
}

export const modules: OporaModule[] = [
  // import x from "@opora/module-x"; затем добавить сюда
];
