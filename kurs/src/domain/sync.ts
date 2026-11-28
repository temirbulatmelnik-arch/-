// Инструкция для проекта «Финансы». Полный файл и ответ чата используют одну версию протокола.
export const PROTOCOL_VERSION = '2.9';

export const PROJECT_INSTRUCTIONS = `КУРС · ОБМЕН С ЧАТОМ · ${PROTOCOL_VERSION}

Для зарплаты, отпусков, истории и плана используй свежий полный экспорт «Курс — обмен …». Короткий предназначен для текущей сверки.

На просьбу внести изменения дай один JSON-файл или блок JSON:
{
  "app": "kurs-exchange",
  "version": 2,
  "protocolVersion": "${PROTOCOL_VERSION}",
  "from": "chat",
  "baseRevision": "точное значение из выгрузки",
  "exportId": "точное значение из выгрузки",
  "patchId": "уникальный стабильный ключ этого изменения",
  "date": "дата выгрузки YYYY-MM-DD",
  "summary": "что меняется",
  "checklist": [{ "id": "example-task", "title": "Сверить график" }]
}
Включай только запрошенные правки. Для повтора сохрани patchId. Для нового решения возьми свежую baseRevision. Перед JSON поясни правки и вопросы к сверке. «Курс» покажет предпросмотр перед подтверждением.

ЧТО ОТДАЁТ ПОЛНАЯ ВЫГРУЗКА

status, history, payrollRegister, weeks и checkups служат для сверки. В history есть календарные поправки, отметки, закрытия недель, журналы денег и снимки долга. Расчёты обновляет «Курс». План и предложенные переводы не подтверждают банковский факт.

КАКИЕ ИЗМЕНЕНИЯ ПРИНИМАЕТ «КУРС»

• work — расчёт зарплаты и отпусков. rates[] адресуется по from (YYYY-MM-DD): unit, positionUnits, rankUnits, seniority, conditions, monthlyBonus, confidence confirmed/estimate, source. vacations[] адресуется по id: from, to, status planned/approved/taken, allowance, payDate, dailyGross, estimateUnit, gross, basis, formula {divisor, additions:[{amount,index}]}. Новая ставка требует всех компонентов, новый отпуск — дат и статуса. Не перекрывай отпуска. Подтверждённые прошедшие отпуска сохраняются. Дополнительно можно уточнить from, accountId, advancesBy (days/hours), cautiousUnit2027, quarterlyBonus {from,months,day,gross}, vacationDaysRemaining, workingHours, absenceHours, attendance {paidDays,firstPaidDays}, deductions, taxBase {asOf,base}, extras {date,title,kind,gross}, payDates, payDateSources и aliases. Словари обновляются по ключу. Прогнозную дату конкретной выплаты передавай через work.payDates, с пояснением в work.payDateSources; отпускные можно уточнить через vacations[].payDate. Удаление строки — rates/vacations с delete:true или work.remove [{section,key,delete:true}] для attendance, workingHours, absenceHours, deductions, extras, taxBase, payDates, payDateSources, aliases. work.clear принимает список необязательных параметров accountId, advancesBy, cautiousUnit2027, quarterlyBonus, vacationDaysRemaining.
• Расчётный документ передавай в work.actual по ключу выплаты: asOf, net, gross, tax, otherWithheld, payDate, payMonth, accrualPeriod, kind, title, verifiedBy. Листок и банковское зачисление — разные факты. Для исправления документального gross, tax или otherWithheld используй payrollDocumentEdits [{key,previous:{tax:100},values:{tax:110},source,reason}]. Для исправления известной чистой выплаты — actualCorrection [{key,oldValue,newValue,reason,source,revision}]. Поля revision и baseRevision одинаковые. Объединённое зачисление связывай через payrollReceiptLinks [{operationId,parts:[{key,amount}],reason}]. Сумма частей должна дать существующее зачисление.
• limits.weekly обновляет особый лимит по паре from/to; для удаления используй {from,to,delete:true}. limits.defaultWeekly — {from,amount} для базового лимита с понедельника или null для сброса. Особые недели имеют приоритет. limits.phases обновляется по id, categories — по категории. bonusRules и shortfall обновляются по месяцу YYYY-MM; null удаляет настройку месяца. bonusMonths и merchantRules передаются целиком. weeklyDefaults добавляет только периоды, не пересекающиеся с существующими.
• expenses — расходы с датой, суммой, категорией и счётом. Правка и удаление по id из файла; удаление явно delete:true. Для нового подтверждённого расхода используй стабильный новый id или банковский fingerprint/occurredAt; для второй одинаковой операции передавай отдельный id и основание. source: life/reserve/credit, creditCard — id долга, accountId — фактический счёт, fundingSource: own/borrowed/unknown, budgetScope: weekly/separate/unknown. Категории: groceries, work, taxi, transport, health, shopping, beauty, tobacco, fun, fixed. Для уже связанного банковского списания используй operationEdits [{id,note,category,budgetScope,reason}]. budgetScope weekly/separate распределяет только ещё не распределённую часть. Не дублируй расход в журнале.
• debts — ID долга, ставка rate долей, карточка долга, dueDay (число или last), minPayment для ближайшего платежа, rule для формулы: {type:"fixed",amount}, {type:"interestPlus",share,min}, {type:"annuity",endDate,amount} или {type:"schedule",items:[{date,amount}]}. Уточняй плановую дату закрытия в targetClose, банковское закрытие — по факту в closed/closedOn. Остаток существующего долга меняется через bankCorrection.
• fixed — регулярный платёж по id: name, day, amount, from (месяц), note. events — разовые события со стабильным key, date, title, kind payment/income и amount. Для новой строки используй новый ключ с префиксом chat:. Удаление по id/key и delete:true. incomeEdits обновляет один шаблон по kind, например {kind:"bonusMonthly",day:15,amount:20000}; everyMonth:true снимает ограничение по месяцам, delete:true убирает шаблон. Полный список шаблонов передаётся только через incomes. Для заработка из work меняй параметры work.
• calendar — только по известному key. Для будущего события можно изменить date, amount, prepareOn (дата раньше платежа, null для сброса), projection (conditional/review/internal_transfer, null для сброса), reviewFor (ключ платежа для возможной доплаты), economicType:"non_income", reset/resetAmount. Банковский факт: done:true, paid, paidDate и при необходимости paidFrom card/reserve. Свяжи с подтверждённой операцией accountBook.operations по eventKey, если это фактическое зачисление или списание. Не отмечай расчётную выплату или запланированный перевод как факт. Подтверждённая сумма и дата защищены от обычной правки.
• accountBook — счета, отдельные confirmed/planned операции, переводы между своими счетами (type:"transfer", accountId, toAccountId), исторические займы, графики Сплита, payoffTerms и stress. Используй стабильные id, банковские externalId и eventKey при наличии. paymentAccounts хранит маршрутизацию для плана с несколькими счетами; в текущей однокарточной схеме используется карта жизни. Новые поступления, комиссии, переводы и возвраты добавляй только по банковскому факту. Не переноси одну банковскую операцию одновременно в expenses, календарь и отдельное событие. Для маршрута указывай реальный счёт; деньги под платежи отделяй от недельных. Удаления настройки или запланированной строки: accountBook.remove [{section,key,delete:true}].
• bankCorrection — банковская сверка с {key,oldValue,newValue,date,reason,source,revision}. У life и reserve ключи счёта именно life и reserve; для других счетов и долгов бери ID из файла. Указывай дату текущей банковской сверки. Для особой сверки доступного остатка можно передать availableSnapshot:true и исходный exportId. paymentReconciliation служит для связи дублирующих записей платежа с подтверждённым переводом. Не записывай банковский баланс в reserve, card или debts[].balance существующего долга.
• checklist адресуется по id. Допустимы title, note, due (дата или месяц), done, status (review/payment/clarify), eventKey и afterReceiptKey. Удаление — delete:true. Пустая строка в due, note, eventKey или afterReceiptKey убирает связь или значение.
• strategy и rules — полные списки. Для точечных замен используй strategyEdits [{title,find,replace}] или ruleEdits [{find,replace}]. bridge — план кредитного моста целиком, либо {closed:true} после сверки.

Суммы — числа с копейками. Для существующих записей бери точные ключи из экспорта. При неоднозначной выписке перечисли вопросы. В импорт включай только правки.`;
