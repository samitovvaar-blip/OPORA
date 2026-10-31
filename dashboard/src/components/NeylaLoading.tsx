// Все загрузки — сообщением от Нейлы сверху (вместо «Загрузка…»)
const PHRASES = ["Минуточку, загружаю данные", "Секунду, открываю кабинет", "Подтягиваю документы", "Готовлю отчёт, подождите"];

export default function NeylaLoading({ text }: { text?: string }) {
  const t = text || PHRASES[Math.floor(Date.now() / 1000) % PHRASES.length];
  return <div className="neyla-toast">
    <img src="neyla.jpg" alt="" />
    <div className="neyla-bubble"><b>Нейла</b><span>{t}<span className="dots"><i>.</i><i>.</i><i>.</i></span></span></div>
  </div>;
}
