import { createHash } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const { RESEND_API_KEY, OPORA_EMAIL_FROM, OPORA_TELEGRAM_CHANNEL, OPORA_INSTAGRAM_URL } = process.env;
if (!RESEND_API_KEY || !OPORA_EMAIL_FROM || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.log("Trial email is off. Configure the sender and Firestore credentials to enable it.");
  process.exit(0);
}

initializeApp({ credential: applicationDefault(), projectId: "opora-4efe1" });
const db = getFirestore();
const DAY = 86_400_000;
const now = Date.now();
const login = "https://samitovvaar-blip.github.io/OPORA/#/login";
const contact = "Вопросы и выбор тарифа: @samitovva — https://t.me/samitovva";
const invites = await db.collection("demoInvites")
  .where("issuedAt", ">", Timestamp.fromMillis(now - 2 * DAY)).get();
let failures = 0;

for (const invite of invites.docs) {
  try {
    const data = invite.data();
    const issued = data.issuedAt.toMillis();
    const age = now - issued;
    if (age < 0 || age >= 2 * DAY) continue;
    const stage = age >= DAY ? 2 : 1;
    const mailRef = invite.ref.collection("delivery").doc(issued + "-" + stage);
    if ((await mailRef.get()).exists) continue;
    const current = await invite.ref.get();
    if (current.data()?.issuedAt?.toMillis() !== issued) continue;
    const offers = data.offers?.length ? "\nДоступные тарифы:\n" + data.offers.map((offer) => "• " + offer).join("\n") : "";
    const social = [
      OPORA_TELEGRAM_CHANNEL ? "Telegram-канал ОПОРЫ: " + OPORA_TELEGRAM_CHANNEL : "",
      OPORA_INSTAGRAM_URL ? "Instagram ОПОРЫ: " + OPORA_INSTAGRAM_URL : "",
    ].filter(Boolean).join("\n");
    const secondDay = [
      "Сегодня второй день демо. Попробуйте добавить клиента, ввести план продаж или отметить задачу.",
      "Завтра демо перейдёт в режим просмотра.", offers, social,
    ].filter(Boolean).join("\n");
    const text = [
      "Привет! Я Нейла, помощник ОПОРЫ.",
      stage === 1
        ? "Ваше демо открыто на три дня. Зайдите на эту почту, выберите «Товары», «Услуги» или «Сотрудник» и пройдите короткое обучение."
        : secondDay,
      login, contact,
    ].join("\n\n");
    const idempotency = createHash("sha256").update(invite.id + "|" + issued + "|" + stage).digest("hex");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "opora-trial-" + idempotency,
      },
      body: JSON.stringify({ from: OPORA_EMAIL_FROM, to: [invite.id],
        subject: stage === 1 ? "Нейла: ваш демо-доступ к ОПОРЕ открыт" : "Нейла: что попробовать во второй день демо",
        text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Resend HTTP " + response.status);
    await mailRef.set({ sentAt: Timestamp.now() });
  } catch (error) {
    failures += 1;
    console.error(error instanceof Error ? error.message : "Trial email failed");
  }
}

if (failures) process.exitCode = 1;
