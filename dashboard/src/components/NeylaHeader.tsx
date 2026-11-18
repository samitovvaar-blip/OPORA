import type { ReactNode } from "react";

export default function NeylaHeader({ description, action }: { description: string; action?: ReactNode }) {
  return <div className="card row neyla-header">
    <span className="neyla-header-identity">
      <img src="neyla.jpg" alt="" />
      <span><b>Нейла — ваш помощник</b><span className="small muted neyla-header-description">{description}</span></span>
    </span>
    {action}
  </div>;
}
