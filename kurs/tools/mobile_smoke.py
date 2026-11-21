"""Run against an npm preview of the production build using Python Playwright."""
import argparse
import json
import re
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright


def app_fixture():
    return {
        "version": 8,
        "state": {
            "ready": True,
            "asOf": "2026-11-21",
            "templateFrom": "2027-01",
            "settings": {"tourSeen": 100},
            "expenses": [],
            "reserve": 90000,
            "reserveLog": [
                {"id": "anchor", "date": "2026-11-20", "abs": True, "amount": 90000, "note": "Сверка"}
            ],
            "cardBalance": {"amount": 2000, "date": "2026-11-20", "source": "manual", "at": "2026-11-20T12:00:00Z"},
            "weeklyOverrides": [{"from": "2026-01-01", "to": "2027-12-31", "amount": 10500}],
            "debts": [{
                "id": "card-example", "name": "Карта", "short": "Карта", "kind": "card", "balance": 36000,
                "startBalance": 40000, "rate": 0.5, "rule": {"type": "fixed", "amount": 3000},
                "frozen": True, "order": 1, "closed": False, "dueDay": 2
            }],
        }
    }


def new_page(browser, playwright, url, width, height, mode):
    device = {**playwright.devices["iPhone 13"]}
    device.pop("default_browser_type", None)
    device.update(viewport={"width": width, "height": height}, screen={"width": width, "height": height})
    context = browser.new_context(**device, timezone_id="Europe/Moscow", reduced_motion="reduce")
    seed = json.dumps(json.dumps(app_fixture()))
    context.add_init_script(
        "if (!localStorage.kurs) localStorage.kurs = " + seed + ";"
        "if (" + json.dumps(mode) + " === 'standalone') {"
        "Object.defineProperty(navigator, 'standalone', {value: true});"
        "const original = matchMedia;"
        "window.matchMedia = query => query === '(display-mode: standalone)' ? "
        "Object.assign(new EventTarget(), {matches:true, media:query}) : original.call(window, query);}"
    )
    page = context.new_page()
    page.set_default_timeout(15000)
    page.clock.set_fixed_time(datetime(2026, 11, 21, 15, 0, tzinfo=timezone.utc))
    page.goto(url, wait_until="domcontentloaded")
    page.get_by_text("Свои на неделю", exact=True).wait_for()
    return context, page


def check_layout(page, enlarged=False):
    if enlarged:
        page.add_style_tag(content="html {font-size: 150%}")
    page.evaluate("document.fonts.ready")
    page.wait_for_function("""() => {
      const scene = document.querySelector('svg[aria-label^="Нева на закате"]');
      const header = document.querySelector('[data-week-instruments]');
      return header.getBoundingClientRect().bottom + 12 <=
        new DOMPoint(0, 203).matrixTransform(scene.getScreenCTM()).y;
    }""")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert page.evaluate("""() => {
      const root = document.querySelector('[data-week-instruments]');
      const amount = root.querySelector('[aria-live="polite"]');
      const ring = root.querySelector('button.touch-none');
      const a = amount.getBoundingClientRect(), b = ring.getBoundingClientRect();
      return a.right <= b.left && amount.scrollWidth <= amount.clientWidth + 2;
    }""")


def check_features(browser, playwright, url):
    context, page = new_page(browser, playwright, url, 390, 844, "standalone")
    page.get_by_role("button", name=re.compile("^Долги")).first.click()
    page.get_by_role("button", name=re.compile("^Выгодная досрочка")).click()
    details = page.get_by_role("dialog", name="Выгодная досрочка")
    details.get_by_role("button", name="Самостоятельный анализ").click()
    details.get_by_role("button", name="31 марта 2027 года").click()
    details.get_by_role("button", name=re.compile("^Карта Прогноз долга")).click()
    details.get_by_role("button", name="Погасить частично", exact=True).click()
    details.get_by_label("Сумма в счёт основного долга, ₽").fill("1234,56")
    details.get_by_role("button", name="Рассчитать последствия").click()
    details.get_by_role("img", name="График резерва по датам, ₽").wait_for(timeout=30000)
    details.get_by_role("button", name="Базовый", exact=True).click()
    details.get_by_text("Экономия на процентах и комиссиях", exact=True).wait_for()
    assert details.get_by_role("table").count() == 0
    assert details.locator("select").count() == 0
    assert page.evaluate("JSON.parse(localStorage.kurs).state.debts[0].balance") == 36000
    details.get_by_role("button", name="Закрыть", exact=True).click()
    page.get_by_role("button", name="Сегодня", exact=True).first.click()
    page.get_by_role("button", name="Из банка", exact=True).first.click()
    bank = page.get_by_role("dialog", name="Выписка из банка")
    bank.get_by_role("button", name="Выбрать скриншот").wait_for()

    artwork = context.new_page()
    artwork.set_content("""<meta name="viewport" content="width=device-width">
    <div style="width:360px;padding:14px;background:white;color:black;font:bold 28px sans-serif">
    21.11.2026<br>Пятёрочка<br>Покупка −350,00 RUB
    </div>""")
    sample = artwork.locator("div").screenshot()
    artwork.close()
    foreign = []
    page.on("request", lambda req: foreign.append(req.url) if req.url.startswith(("http:", "https:")) and not req.url.startswith(url) else None)
    image = bank.locator('input[accept="image/*"]')
    image.set_input_files({"name": "example.png", "mimeType": "image/png", "buffer": sample})
    bank.get_by_text("Найдена 1 операция", exact=True).wait_for(timeout=90000)
    bank.get_by_role("button", name=re.compile("^Редактировать")).first.click()
    assert bank.get_by_label("Сумма", exact=True).first.input_value() == "350"
    assert page.evaluate("JSON.parse(localStorage.kurs).state.expenses.length") == 0
    bank.get_by_label("Проверено, добавить").first.check()
    bank.get_by_role("button", name=re.compile("^Записать отмеченные")).click()
    bank.wait_for(state="hidden")
    page.get_by_text("Свои на неделю", exact=True).wait_for()
    assert page.evaluate("JSON.parse(localStorage.kurs).state.expenses.length") == 1
    page.get_by_role("button", name="Из банка", exact=True).first.click()
    image.set_input_files({"name": "example.png", "mimeType": "image/png", "buffer": sample})
    bank.get_by_text("Строка с этого снимка уже записана", exact=True).wait_for(timeout=90000)
    assert bank.get_by_label("Проверено, добавить").first.is_disabled()
    bank.get_by_role("button", name="Закрыть", exact=True).click()
    page.get_by_role("button", name="Из банка", exact=True).first.click()
    artwork = context.new_page()
    artwork.set_content("""<meta name="viewport" content="width=device-width">
    <style>html{background:#131518;color:white;font:700 22px sans-serif} section{width:360px;padding:12px}
    header{font-size:18px;margin:22px 0} .line{display:flex;justify-content:space-between;align-items:center;min-height:85px}
    small{display:block;font-size:17px;color:#aaa}</style>
    <section>
      <header>История</header><header>14 ноября −725 ₽</header>
      <div class="line"><span>Винлаб<small>Алкоголь</small></span><span>−480 P</span></div>
      <div class="line"><span>Транспорт</span><span>−46</span></div>
      <div class="line"><span>Яндекс Плюс</span><span>−199<br>руб.</span></div>
      <header>13 ноября −1515,92 ₽</header>
      <div class="line"><span>Пятерочка<small>Супермаркеты</small></span><span>−1 059,92 ₽</span></div>
      <div class="line"><span>Администрация<small>Зарплата</small></span><span>+12 284 ₽</span></div>
      <div class="line"><span>Кафе</span><span>−530 ₽</span></div>
      <div class="line"><span>Между своими<br>счетами</span><span>1 000 ₽</span></div>
      <div class="line">Баланс карты 70 000 ₽</div>
    </section>""")
    history = artwork.locator("section").screenshot()
    artwork.close()
    image.set_input_files([{"name": "history.png", "mimeType": "image/png", "buffer": history},
                           {"name": "example.png", "mimeType": "image/png", "buffer": sample}])
    bank.get_by_role("heading", name=re.compile("^Найден")).wait_for(timeout=110000)
    count = bank.get_by_role("heading", name=re.compile("^Найден")).inner_text()
    assert count == "Найдено 8 операций", bank.inner_text()
    assert bank.get_by_text("Строка с этого снимка уже записана", exact=True).count() == 1
    assert page.evaluate("JSON.parse(localStorage.kurs).state.expenses.length") == 1
    assert not foreign
    context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--engine", choices=["chromium", "webkit"], default="chromium")
    parser.add_argument("--executable")
    parser.add_argument("--layout-only", action="store_true")
    options = parser.parse_args()
    with sync_playwright() as playwright:
        browser = getattr(playwright, options.engine).launch(executable_path=options.executable)
        for width, height in [(320, 568), (390, 844), (430, 932)]:
            for mode in ["browser", "standalone"]:
                context, page = new_page(browser, playwright, options.url, width, height, mode)
                check_layout(page)
                check_layout(page, enlarged=True)
                print(f"{options.engine} {width}×{height} {mode}, 100% and 150%: OK", flush=True)
                context.close()
        if not options.layout_only:
            check_features(browser, playwright, options.url)
            print(f"{options.engine}: repayment screen and local screenshot import: OK", flush=True)
        browser.close()


if __name__ == "__main__":
    main()
