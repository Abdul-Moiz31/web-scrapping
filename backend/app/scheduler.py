from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db import push_task
from app.settings import get_cron_override
from app.sources.registry import get_source, list_all_sources

scheduler = BackgroundScheduler()


def _enqueue_discover(source_id: str) -> None:
    push_task("fetch_tasks", {"source": source_id, "type": "discover"})


def effective_cron_schedule(source_id: str) -> str:
    source = get_source(source_id)
    return get_cron_override(source_id) or source.cron_schedule


def schedule_source(source_id: str) -> None:
    """Registers (or re-registers) a single source's cron job -- used at
    startup for every known source and again whenever a custom source is
    created, so it starts scraping without an API restart."""
    scheduler.add_job(
        _enqueue_discover,
        trigger=CronTrigger.from_crontab(effective_cron_schedule(source_id)),
        args=[source_id],
        id=source_id,
        replace_existing=True,
    )


def unschedule_source(source_id: str) -> None:
    if scheduler.get_job(source_id):
        scheduler.remove_job(source_id)


def start_scheduler() -> None:
    for source in list_all_sources():
        schedule_source(source.id)
    scheduler.start()


def reschedule(source_id: str, cron_schedule: str) -> None:
    """Raises ValueError if cron_schedule isn't a valid 5-field crontab string."""
    scheduler.reschedule_job(source_id, trigger=CronTrigger.from_crontab(cron_schedule))
