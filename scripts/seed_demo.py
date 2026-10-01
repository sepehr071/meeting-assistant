"""Seed a throwaway SQLite database with a FICTIONAL Persian demo workspace
(made-up team, speakers and meetings) and print a signed session cookie, so
the UI can be explored and screenshotted without Keycloak or API keys.

    cd backend
    PYTHONPATH=. DATABASE_URL=sqlite+aiosqlite:///./demo.db uv run python ../scripts/seed_demo.py

Prints `ma_session=<value>` on the last line. Set it as a cookie on the
backend host (e.g. with Playwright) to be logged in as the demo user.
Nothing here calls ElevenLabs or OpenRouter; all content is hand-written.
"""
from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime, timedelta, timezone

from itsdangerous import TimestampSigner

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import (
    ChatMessage,
    EmailTone,
    KeytermSource,
    Meeting,
    MeetingStatus,
    Series,
    SeriesKeyterm,
    SeriesSpeakerName,
    Speaker,
    Summary,
    Tag,
    Transcript,
    User,
)
from app.services.pipeline import build_minutes_segments

NOW = datetime.now(timezone.utc)


def words_from(utterances: list[tuple[str, float, str]], end_s: float) -> list[dict]:
    """(speaker_id, start_s, text) lines -> Scribe-shaped word/spacing items."""
    out: list[dict] = []
    for i, (sid, start, text) in enumerate(utterances):
        stop = utterances[i + 1][1] - 0.4 if i + 1 < len(utterances) else end_s
        tokens = text.split()
        step = (stop - start) / max(len(tokens), 1)
        for j, tok in enumerate(tokens):
            t0 = start + j * step
            out.append({"text": tok, "start": t0, "end": t0 + step * 0.85, "type": "word", "speaker_id": sid})
            out.append({"text": " ", "start": t0 + step * 0.85, "end": t0 + step, "type": "spacing", "speaker_id": sid})
    return out


def plain_text(utterances: list[tuple[str, float, str]], names: dict[str, str]) -> str:
    return "\n\n".join(f"{names[sid]}: {text}" for sid, _, text in utterances)


SPRINT_NAMES = {
    "speaker_0": "نگار (مدیر محصول)",
    "speaker_1": "بهرام (بک\u200cاند)",
    "speaker_2": "سارا (طراحی)",
    "speaker_3": "امید (تست)",
}

SPRINT = [
    ("speaker_0", 0.0, "سلام به همه. امروز می\u200cخواهیم اسپرینت ۲۴ اپلیکیشن آکمه\u200cپی را برنامه\u200cریزی کنیم. سه موضوع داریم: پرداخت قسطی، بازطراحی صفحه تراکنش\u200cها و باگ\u200cهای نسخه قبل."),
    ("speaker_1", 42.0, "از سمت بک\u200cاند، سرویس پرداخت قسطی تقریباً آماده است. فقط وب\u200cهوک بانک مانده که هنوز در محیط تست جواب ثابتی نمی\u200cدهد."),
    ("speaker_0", 118.0, "اگر وب\u200cهوک تا چهارشنبه پایدار نشود، می\u200cتوانیم با پرچم ویژگی منتشرش کنیم و فقط برای ده درصد کاربران فعال کنیم؟"),
    ("speaker_1", 161.0, "بله، پرچم ویژگی را داریم. پیشنهاد می\u200cکنم یک صف تلاش مجدد هم اضافه کنیم که اگر وب\u200cهوک دیر رسید، تراکنش گم نشود."),
    ("speaker_2", 236.0, "برای صفحه تراکنش\u200cها سه نسخه طراحی آماده کرده\u200cام. در تست کاربردپذیری، نسخه دوم که فیلترها بالای لیست است بهترین نتیجه را گرفت."),
    ("speaker_3", 331.0, "یک نکته: در نسخه قبل، تاریخ شمسی در فیلتر گزارش\u200cها یک روز جابه\u200cجا نمایش داده می\u200cشد. قبل از بازطراحی باید این باگ بسته شود."),
    ("speaker_2", 402.0, "موافقم. در طراحی جدید تقویم شمسی را از همان کامپوننت مشترک استفاده می\u200cکنیم که این مشکل تکرار نشود."),
    ("speaker_0", 470.0, "خب، پس تصمیم این شد: نسخه دوم طراحی را می\u200cسازیم و باگ تاریخ اولویت اول تیم تست است. بهرام، تخمینت برای صف تلاش مجدد چیست؟"),
    ("speaker_1", 541.0, "حدود سه روز کاری. اگر امید سناریوهای تست را تا دوشنبه بدهد، تا آخر هفته روی محیط استیجینگ است."),
    ("speaker_3", 598.0, "سناریوها را تا دوشنبه می\u200cفرستم. فقط سؤال دارم: برای پرداخت قسطی سقف مبلغ را چه کسی تأیید می\u200cکند؟"),
    ("speaker_0", 655.0, "این را باید با تیم مالی هماهنگ کنم. تا جلسه بعد جوابش را می\u200cآورم."),
    ("speaker_2", 702.0, "من هم تا پنجشنبه نمونه تعاملی صفحه تراکنش\u200cها را در فیگما به اشتراک می\u200cگذارم تا همه نظر بدهند."),
    ("speaker_0", 760.0, "عالی. جمع\u200cبندی می\u200cکنم: پرداخت قسطی با پرچم ویژگی، صف تلاش مجدد، طراحی نسخه دوم و بستن باگ تاریخ. ممنون از همه."),
]

SPRINT_SUMMARY = {
    "exec_summary": (
        "تیم محصول آکمه\u200cپی اسپرینت ۲۴ را برنامه\u200cریزی کرد. سرویس پرداخت قسطی تقریباً آماده است و "
        "با پرچم ویژگی برای ده درصد کاربران منتشر می\u200cشود؛ برای جلوگیری از گم\u200cشدن تراکنش\u200cها یک صف "
        "تلاش مجدد به وب\u200cهوک بانک اضافه می\u200cشود. نسخه دوم طراحی صفحه تراکنش\u200cها که در تست "
        "کاربردپذیری بهترین نتیجه را داشت انتخاب شد و بستن باگ نمایش تاریخ شمسی اولویت اول تیم تست است. "
        "سقف مبلغ پرداخت قسطی هنوز نیاز به تأیید تیم مالی دارد."
    ),
    "action_items": [
        {"text": "پیاده\u200cسازی صف تلاش مجدد برای وب\u200cهوک بانک", "owner": "بهرام", "due_date": "پایان هفته"},
        {"text": "ارسال سناریوهای تست پرداخت قسطی", "owner": "امید", "due_date": "دوشنبه"},
        {"text": "اشتراک نمونه تعاملی صفحه تراکنش\u200cها در فیگما", "owner": "سارا", "due_date": "پنجشنبه"},
        {"text": "هماهنگی سقف مبلغ پرداخت قسطی با تیم مالی", "owner": "نگار", "due_date": "جلسه بعد"},
        {"text": "رفع باگ جابه\u200cجایی یک\u200cروزه تاریخ شمسی در فیلتر گزارش\u200cها", "owner": "امید", "due_date": None},
    ],
    "decisions": [
        "پرداخت قسطی با پرچم ویژگی و ابتدا برای ده درصد کاربران منتشر می\u200cشود.",
        "نسخه دوم طراحی صفحه تراکنش\u200cها (فیلترها بالای لیست) ساخته می\u200cشود.",
        "تقویم شمسی در همه صفحات از کامپوننت مشترک استفاده می\u200cکند.",
    ],
    "qa": [
        {"question": "اگر وب\u200cهوک بانک تا چهارشنبه پایدار نشود چه می\u200cکنیم؟", "answer": "با پرچم ویژگی منتشر می\u200cشود و صف تلاش مجدد از گم\u200cشدن تراکنش جلوگیری می\u200cکند."},
        {"question": "صف تلاش مجدد چقدر زمان می\u200cبرد؟", "answer": "حدود سه روز کاری؛ تا آخر هفته روی استیجینگ."},
    ],
    "open_questions": [
        {"question": "سقف مبلغ پرداخت قسطی را چه کسی تأیید می\u200cکند؟", "owner": "نگار"},
    ],
    "email_subject": "صورتجلسه برنامه\u200cریزی اسپرینت ۲۴ — آکمه\u200cپی",
    "email_draft": (
        "با سلام و احترام،\n\n"
        "خلاصه جلسه برنامه\u200cریزی اسپرینت ۲۴ به شرح زیر است.\n\n"
        "تصمیم\u200cها: پرداخت قسطی با پرچم ویژگی برای ده درصد کاربران منتشر می\u200cشود و نسخه دوم طراحی صفحه تراکنش\u200cها انتخاب شد.\n\n"
        "اقدامات: بهرام صف تلاش مجدد وب\u200cهوک را تا پایان هفته پیاده می\u200cکند، امید سناریوهای تست را تا دوشنبه ارسال می\u200cکند "
        "و سارا نمونه تعاملی را تا پنجشنبه به اشتراک می\u200cگذارد.\n\n"
        "سؤال باز: سقف مبلغ پرداخت قسطی در انتظار تأیید تیم مالی است.\n\n"
        "با تشکر،\nنگار"
    ),
}

SPRINT_CHAT = [
    ("user", "چه کسی مسئول صف تلاش مجدد است و کی تحویل می\u200cدهد؟"),
    ("assistant", "**بهرام** مسئول پیاده\u200cسازی صف تلاش مجدد برای وب\u200cهوک بانک است. تخمین او حدود **سه روز کاری** است و گفت اگر سناریوهای تست تا دوشنبه برسد، تا آخر هفته روی محیط استیجینگ خواهد بود."),
    ("user", "ریسک اصلی این اسپرینت چیست؟"),
    ("assistant", "دو ریسک در جلسه مطرح شد:\n\n1. **ناپایداری وب\u200cهوک بانک** در محیط تست — با پرچم ویژگی (۱۰٪ کاربران) و صف تلاش مجدد کنترل می\u200cشود.\n2. **سقف مبلغ پرداخت قسطی** هنوز تأیید نشده و نگار باید تا جلسه بعد با تیم مالی هماهنگ کند."),
]

DESIGN_NAMES = {"speaker_0": "سارا (طراحی)", "speaker_1": "نگار (مدیر محصول)"}
DESIGN = [
    ("speaker_0", 0.0, "در داشبورد جدید کارت\u200cهای خلاصه را به بالای صفحه آوردیم و نمودار هفتگی را ساده\u200cتر کردیم."),
    ("speaker_1", 64.0, "خوب است. حالت تاریک را هم در این نسخه داریم؟"),
    ("speaker_0", 110.0, "بله، رنگ\u200cها را با توکن\u200cهای مشترک تعریف کرده\u200cایم و حالت تاریک همزمان منتشر می\u200cشود."),
    ("speaker_1", 170.0, "پس تصمیم این است که داشبورد جدید با حالت تاریک در اسپرینت بعد منتشر شود."),
]

SUPPORT_NAMES = {"speaker_0": "رضا (پشتیبانی)", "speaker_1": "نگار (مدیر محصول)", "speaker_2": "بهرام (بک\u200cاند)"}
SUPPORT = [
    ("speaker_0", 0.0, "این هفته بیشترین تیکت\u200cها درباره تأخیر در پیامک تأیید پرداخت بود."),
    ("speaker_2", 58.0, "سرویس پیامک را بررسی کردیم؛ مشکل از سمت ارائه\u200cدهنده بود و از دیروز برطرف شده."),
    ("speaker_1", 120.0, "یک پیام راهنما در اپ اضافه کنیم که کاربر بداند می\u200cتواند کد را دوباره درخواست کند."),
    ("speaker_0", 175.0, "موافقم، متن پیشنهادی را تا فردا می\u200cفرستم."),
]


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as s:
        user = User(username="demo", email="demo@example.com", oidc_sub="demo-sub")
        s.add(user)
        await s.flush()

        weekly = Series(name="جلسات هفتگی تیم محصول", email_tone=EmailTone.FORMAL, owner_id=user.id)
        support = Series(name="هماهنگی با پشتیبانی", email_tone=EmailTone.CASUAL, owner_id=user.id)
        s.add_all([weekly, support])
        await s.flush()
        for term, src in [("آکمه\u200cپی", KeytermSource.MANUAL), ("وب\u200cهوک", KeytermSource.ACCEPTED),
                          ("پرچم ویژگی", KeytermSource.ACCEPTED), ("استیجینگ", KeytermSource.SUGGESTED),
                          ("اسپرینت", KeytermSource.MANUAL)]:
            s.add(SeriesKeyterm(series_id=weekly.id, term=term, source=src))
        for name in ["نگار", "بهرام", "سارا", "امید"]:
            s.add(SeriesSpeakerName(series_id=weekly.id, display_name=name))

        tags = {n: Tag(name=n, owner_id=user.id) for n in ["اسپرینت", "طراحی", "پرداخت", "پشتیبانی"]}
        s.add_all(tags.values())
        await s.flush()

        async def add_done(title, fname, ago_h, utt, names, end_s, summary, series, tag_names, brief=None):
            m = Meeting(
                title=title, status=MeetingStatus.DONE, original_filename=fname,
                audio_path=f"demo/{fname}", duration_s=end_s, num_speakers=len(names),
                meeting_brief=brief, series_id=series.id if series else None, owner_id=user.id,
                created_at=NOW - timedelta(hours=ago_h), updated_at=NOW - timedelta(hours=ago_h),
            )
            m.tags = [tags[n] for n in tag_names]
            s.add(m)
            await s.flush()
            words = words_from(utt, end_s)
            s.add(Transcript(meeting_id=m.id, raw_json={"demo": True}, plain_text=plain_text(utt, names), words_json=words))
            for sid, name in names.items():
                s.add(Speaker(meeting_id=m.id, speaker_id=sid, display_name=name))
            s.add(Summary(
                meeting_id=m.id, exec_summary=summary["exec_summary"],
                action_items_json=summary.get("action_items", []), decisions_json=summary.get("decisions", []),
                minutes_json=build_minutes_segments(words), qa_json=summary.get("qa", []),
                open_questions_json=summary.get("open_questions", []),
                email_draft=summary.get("email_draft"), email_subject=summary.get("email_subject"),
                email_tone=(series.email_tone.value if series else "formal"), model="demo-data (no LLM call)",
            ))
            return m

        sprint = await add_done(
            "برنامه\u200cریزی اسپرینت ۲۴ — آکمه\u200cپی", "sprint-24-planning.m4a", 3, SPRINT, SPRINT_NAMES,
            2280.0, SPRINT_SUMMARY, weekly, ["اسپرینت", "پرداخت"],
            brief="برنامه\u200cریزی اسپرینت: پرداخت قسطی، بازطراحی تراکنش\u200cها، باگ\u200cها",
        )
        for i, (role, content) in enumerate(SPRINT_CHAT):
            s.add(ChatMessage(meeting_id=sprint.id, role=role, content=content, created_at=NOW - timedelta(minutes=30 - i)))

        await add_done(
            "بازبینی طراحی داشبورد", "dashboard-review.webm", 26, DESIGN, DESIGN_NAMES, 1260.0,
            {
                "exec_summary": "نسخه جدید داشبورد با کارت\u200cهای خلاصه در بالای صفحه و نمودار هفتگی ساده\u200cتر بازبینی شد. حالت تاریک با توکن\u200cهای رنگ مشترک همزمان منتشر می\u200cشود.",
                "action_items": [{"text": "آماده\u200cسازی نسخه نهایی داشبورد برای انتشار", "owner": "سارا", "due_date": "اسپرینت بعد"}],
                "decisions": ["داشبورد جدید همراه با حالت تاریک در اسپرینت بعد منتشر می\u200cشود."],
                "email_subject": "بازبینی طراحی داشبورد",
                "email_draft": "با سلام،\n\nداشبورد جدید با حالت تاریک در اسپرینت بعد منتشر می\u200cشود.\n\nبا تشکر",
            },
            weekly, ["طراحی"],
        )
        await add_done(
            "هماهنگی هفتگی با تیم پشتیبانی", "support-sync.mp3", 50, SUPPORT, SUPPORT_NAMES, 900.0,
            {
                "exec_summary": "تأخیر پیامک تأیید پرداخت علت اصلی تیکت\u200cهای این هفته بود؛ مشکل از ارائه\u200cدهنده بوده و برطرف شده است. یک پیام راهنما برای درخواست مجدد کد به اپ اضافه می\u200cشود.",
                "action_items": [
                    {"text": "ارسال متن پیام راهنمای درخواست مجدد کد", "owner": "رضا", "due_date": "فردا"},
                    {"text": "افزودن پیام راهنما به صفحه تأیید پرداخت", "owner": "بهرام", "due_date": None},
                ],
                "decisions": ["پیام راهنمای درخواست مجدد کد به اپ اضافه می\u200cشود."],
                "open_questions": [{"question": "آیا به ارائه\u200cدهنده پیامک دوم نیاز داریم؟", "owner": None}],
                "email_subject": "هماهنگی پشتیبانی — پیامک تأیید",
                "email_draft": "سلام بچه\u200cها،\n\nمشکل پیامک برطرف شد. رضا متن راهنما را فردا می\u200cفرستد.\n\nممنون!",
            },
            support, ["پشتیبانی", "پرداخت"],
        )
        s.add(Meeting(
            title="دموی محصول برای مشتری نمونه", status=MeetingStatus.SUMMARIZING,
            original_filename="client-demo.m4a", audio_path="demo/client-demo.m4a", duration_s=1740.0,
            num_speakers=3, owner_id=user.id, created_at=NOW - timedelta(minutes=4), updated_at=NOW,
        ))
        await s.commit()
        uid = user.id

    await engine.dispose()
    data = base64.b64encode(json.dumps({"user_id": uid}).encode())
    cookie = TimestampSigner(str(settings.SESSION_SECRET)).sign(data).decode()
    print(f"{settings.SESSION_COOKIE_NAME}={cookie}")


if __name__ == "__main__":
    asyncio.run(main())
