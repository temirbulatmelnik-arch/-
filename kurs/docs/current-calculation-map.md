# Карта расчётов «Курса» 0.9.1

## Вход → учёт → потребители

| Вход | Расчёт и хранимые сведения | Потребители |
| --- | --- | --- |
| Ручной ввод, CSV/PDF, скриншоты, патч | `screens/AddExpense`, `Import`, `ScreenshotImport`, `Sync` → `store.addExpenses/saveOperation/markEvent/applySync` → `expenses`, `accountBook`, `marks`, журнал импорта | История, бюджет, банковская сверка, экспорт |
| Банковский факт | `setCardBalance/checkup/setReserve`, сверочный патч → `cardBalance`, `reserveLog`, `checkups`, банковские точки долгов | `financialJournal → journalAccount → ledger.card/reserve/cashAccounts`; историческая карта через `cardOn` |
| Переводы, удержания, свободная карта | `fundPayment/returnEarmark/keepIncomeForWeek/sweepIncome/confirmWeeklyTransfer` → проводки, целевые доли → `earmarks` → `ledger.lifeAvailable/heldForPayments/pendingSweepToReserve` | «Сегодня», карты и резерв, напоминания, статус и прогноз |
| Общая собственная ликвидность | `buildExchange` складывает карту, резерв и известные счета; `coverageInput/runAccounts` отдельно формируют начальную сумму модели | Отчёт, календарь, досрочка. Прогноз может использовать оценку резерва при неизвестном банковском остатке. |
| Недельный и дневной бюджеты | `weeklyLimit + budgetExpenses + weeklyExpenseCents` → `weekSummary`, `weekMoney`, `weekReport`, `dayBudget`, `availableToday`; возврат относится к исходной неделе | `Week`, `TodaySheet`, `Island`, `WeekSheet`, `Budget`, `Payments`, `LoanSheet`, `exchange.weekFields` |
| Долги | `debtProjection` от контрольной суммы + покупки, выдачи, тело, комиссии, проценты; `ledger.accruedOnCard` добавляет расчётные проценты. `plan.totalDebt` отдельно суммирует записанные остатки | Сверка, карточка долга, график плана и экспорт. График записанных остатков и текущая оценка имеют разный смысл. |
| Будущие обязательства | `eventsBetween` объединяет долги, фиксированные платежи, шаблоны, отпуска, замены Сплита и отметки. `paymentPreparations` сопоставляет доступные удержания. | `Payments`, `PaymentQueue`, виджет, напоминания, экспорт и прогноз |
| Прогноз и безопасная досрочка | `coverageInput → scenarioInput/projectedEvent → runAccounts` или совместимый `run` → первый дефицит и минимум. `safePrepayment` использует осторожный сценарий и бинарный поиск. `createRepaymentPlanner` моделирует кандидатов в worker. | «Хватит ли», календарь, досрочка, экспорт и запрет небезопасной команды стора |
| Оклад, налог, отпуска, премии | `workdays → payComponents/accrual/vacationDays/vacationGross → workPayments/progressiveTax` → `workEvents/eventsBetween`. `payrollRegister`, `annualIncome` собирают отчёты. Факт начисления хранится в `work.actual`, банк и отметки отдельно. | `WorkSheet`, `EventSheet`, годовой доход, JSON, модель поступлений. `projectedEvent` меняет допуск условных доходов по сценарию. |

## Прямое чтение состояния интерфейсом

- `AddExpense` и `ScreenshotImport` читают `expenses`, счета и журнал для заполнения формы, проверок дублей и предпросмотра. `Import` вызывает последовательность команд стора для одной банковской пачки.
- `EventSheet`, `Payments`, `PaymentQueue`, `TransferSheet`, `reminders.ts`, `paymentPush.ts` читают календарные отметки, журнал или сырые расходы. За остатками обращаются к `ledger`, за ручными отметками — непосредственно к хранилищу.
- `Accounts`, `Checkup` и `ReserveSheet` читают банковские снимки и строки журнала для сверки, добавления остатка и истории. Донесение резервной операции и перемещение средств — разные команды.
- `Plan`, `DebtSheet`, `Prepayment`, `LoanSheet`, `FinanceSheet` читают карточки долгов и параметры плана, а для части показателей вычисляют оценку журнала. `Plan` и `store.withSnapshot` используют записанную сумму долгов.
- `Budget`, `TodaySheet`, `Week`, `WeekSheet`, `Island` читают параметры недели и пользуются `useBudgetExpenses`. Дневная и недельная сводки повторно собираются в каждом виджете.
- `store/ui.ts` делает локальный снимок для отмены действия, `Settings` читает состояние для полной копии и предпросмотра восстановления. Для этих сценариев первичные записи необходимы.

Сначала следует стандартизировать входы и формат производных показателей. Визуальные изменения должны опираться на те же селекторы и контрольный слепок.
