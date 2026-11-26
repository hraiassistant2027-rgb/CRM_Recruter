import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Політика конфіденційності — KAN Talent' };

// Публічна сторінка: її перевіряє Google під час налаштування доступу до Gmail і Календаря
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-ink">
      <h1 className="mb-2 text-2xl font-semibold">Політика конфіденційності KAN Talent</h1>
      <p className="mb-8 text-ink-soft">Privacy Policy · Оновлено 24.11.2026</p>

      <section className="space-y-3">
        <p>
          KAN Talent — внутрішня система рекрутингу будівельної компанії KAN. Доступ мають лише працівники відділу рекрутингу та керівники,
          запрошені адміністратором. Публічної реєстрації немає.
        </p>
        <h2 className="pt-4 text-lg font-bold tracking-tight">Дані кандидатів</h2>
        <p>
          Система зберігає дані, які кандидати надали компанії (резюме, контакти, досвід), а також історію відбору. Дані обробляються згідно із
          Законом України «Про захист персональних даних» і GDPR на підставі згоди кандидата або для підготовки до укладення трудового договору.
          Дані зберігаються на серверах у Європейському Союзі, передаються зашифрованими, доступ обмежено правами ролей, усі дії записуються в журнал.
          Кандидат може запросити доступ до своїх даних, їх виправлення або видалення, звернувшись до відділу рекрутингу компанії.
        </p>
        <h2 className="pt-4 text-lg font-bold tracking-tight">Дані облікового запису Google</h2>
        <p>
          Працівник може за власним бажанням підключити свій обліковий запис Google, щоб надсилати листи кандидатам і планувати співбесіди.
          Система використовує дані Google лише для цього:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Gmail (надсилання) — щоб надіслати лист кандидату, який працівник підготував і підтвердив у системі;</li>
          <li>Gmail (читання) — щоб показати в картці кандидата листування саме з цим кандидатом; інші листи не зберігаються;</li>
          <li>Календар (події) — щоб створювати, змінювати й скасовувати події співбесід.</li>
        </ul>
        <p>
          Пароль Google система не отримує. Дозвіл доступу зберігається у зашифрованому вигляді і може бути відкликаний у будь-який момент кнопкою
          «Відключити» в профілі або в налаштуваннях облікового запису Google. Дані Google не продаються, не передаються третім особам,
          не використовуються для реклами чи навчання моделей штучного інтелекту.
        </p>
        <p>
          Використання та передача інформації, отриманої з API Google, відповідає{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , зокрема вимогам щодо обмеженого використання (Limited Use).
        </p>
        <h2 className="pt-4 text-lg font-bold tracking-tight">English summary</h2>
        <p>
          KAN Talent is an internal recruiting system used only by invited employees of KAN. When an employee connects a Google account, the app uses
          Gmail to send messages the employee composes and confirms, reads only correspondence with candidates stored in the system, and manages
          interview events in Google Calendar. Tokens are stored encrypted and can be revoked at any time. Google user data is not sold, shared with third
          parties, used for advertising or for training AI models. Use of information received from Google APIs adheres to the Google API Services User
          Data Policy, including the Limited Use requirements.
        </p>
        <h2 className="pt-4 text-lg font-bold tracking-tight">Контакти</h2>
        <p>Питання щодо обробки даних: hr.ai.assistant.2027@gmail.com</p>
      </section>
    </main>
  );
}
