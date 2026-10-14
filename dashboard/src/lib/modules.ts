// Реестр модулей из других репозиториев. Модули видны только владельцу.
import type { ComponentType } from "react";
import Leads from "../modules/leads/Leads";

export interface OporaModule {
  id: string;
  title: string;
  icon: string;
  path: string;
  component: ComponentType;
  source?: string;
}

export const modules: OporaModule[] = [
  // Перенос antonioavanzato/opora. Данные — только Yandex Cloud, свой вход.
  { id: "leads", title: "Заявки с сайта", icon: "✉", path: "leads", component: Leads, source: "antonioavanzato/opora" },
];
