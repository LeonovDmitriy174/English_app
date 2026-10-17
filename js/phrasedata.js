// phrasedata.js — разговорные фразы для «Пополнить словарь» → «Разговорные фразы» (js/phrasedeck.js).
//
// Одна строка: «фраза | перевод | пример». Пример обязательно содержит саму фразу (по ней потом строится пропуск в задании
// «Слово в предложении»), фразы и переводы в колоде не повторяются (tests/phrasedeck.test.mjs). Фразы записаны без знаков
// в конце и со строчной буквы, как идиомы в словаре; «I» остаётся заглавной.
// Темы идут от самых нужных в разговоре к более редким. Перевод короткий и отвечает на вопрос «как это сказали бы по-русски»,
// а не переводит слово в слово.
export const PHRASE_GROUPS = [
  {
    key: "talk",
    name: "Знакомство и small talk",
    lines: `
how's it going | Как дела? | Hey, Tom! How's it going?
what's up | Что нового? | What's up? You look tired.
long time no see | Сто лет не виделись | Long time no see! Where have you been?
nice to meet you | Приятно познакомиться | Nice to meet you, I'm Anna.
how have you been | Как ты поживал? | It's been ages. How have you been?
what have you been up to | Чем ты занимался? | What have you been up to lately?
take care | Береги себя | See you soon, take care!
see you around | Ещё увидимся | Okay, see you around.
catch you later | Ну, пока | I've got to run. Catch you later!
it's good to see you | Рад тебя видеть | It's good to see you again.
make yourself at home | Чувствуй себя как дома | Come in and make yourself at home.
how was your day | Как прошёл твой день? | How was your day at work?
where are you from | Ты откуда? | Where are you from originally?
what do you do for a living | Кем ты работаешь? | So, what do you do for a living?
do you come here often | Ты здесь часто бываешь? | Do you come here often?
let me introduce myself | Позвольте представиться | Let me introduce myself. I'm Mark.
I've heard a lot about you | Много о тебе слышал | I've heard a lot about you from Jane.
small world | Тесен мир | You know my sister? Small world!
what brings you here | Что привело тебя сюда? | What brings you here so early?
have a good one | Хорошего тебе дня | Thanks for coming. Have a good one!
say hi to your mom for me | Передавай привет маме | Say hi to your mom for me.
welcome back | С возвращением | Welcome back! How was the trip?
how's everything | Как всё поживает? | How's everything at home?
nothing much | Да так, ничего особенного | "What's up?" "Nothing much."
can't complain | Грех жаловаться | "How's work?" "Can't complain."
not bad | Неплохо | "How are you?" "Not bad, thanks."
same here | У меня так же | "I'm tired." "Same here."
likewise | Взаимно | "Pleasure to meet you." "Likewise."
let's keep in touch | Давай не терять связь | It was great. Let's keep in touch.
drop me a line | Черкни мне пару строк | Drop me a line when you get there.
it was nice talking to you | Было приятно поболтать | It was nice talking to you.
I should get going | Мне пора идти | It's late. I should get going.
don't be a stranger | Не пропадай | Don't be a stranger, okay?
how are you holding up | Как ты держишься? | How are you holding up after the move?
`,
  },
  {
    key: "clarify",
    name: "Переспросить и уточнить",
    lines: `
could you say that again | Повторите, пожалуйста | Could you say that again? The line is bad.
I didn't catch that | Я не расслышал | Sorry, I didn't catch that.
what do you mean | Что ты имеешь в виду? | What do you mean, it's gone?
could you speak more slowly | Говорите, пожалуйста, медленнее | Could you speak more slowly? My English is still weak.
how do you say it in English | Как это сказать по-английски? | How do you say it in English?
what does that mean | Что это значит? | What does that mean, exactly?
let me get this straight | Давай-ка разберёмся | Let me get this straight: you quit?
are you with me | Ты следишь за мыслью? | Are you with me so far?
can you give me an example | Можешь привести пример? | Can you give me an example?
I'm not following | Я не улавливаю мысль | Sorry, I'm not following.
sorry, what was that | Простите, как вы сказали? | Sorry, what was that? I wasn't listening.
come again | Что-что? | Come again? I didn't hear you.
could you spell that | Продиктуйте по буквам | Could you spell that for me, please?
do you know what I mean | Понимаешь, о чём я? | It's hard to explain, do you know what I mean?
could you be more specific | Можно поконкретнее? | Could you be more specific?
can you walk me through it | Можешь объяснить по шагам? | Can you walk me through it?
I'm not sure I understand | Не уверен, что понимаю | I'm not sure I understand the question.
that's not what I meant | Я имел в виду не это | That's not what I meant at all.
let me put it another way | Скажу иначе | Let me put it another way.
what I'm trying to say is | Я пытаюсь сказать, что | What I'm trying to say is that we need help.
am I making sense | Я понятно говорю? | Am I making sense?
it's hard to explain | Это трудно объяснить | It's hard to explain, but I'll try.
to put it simply | Проще говоря | To put it simply, we ran out of money.
in other words | Другими словами | In other words, you refuse.
how come | Как так вышло? | How come you never called?
wait, what | Стоп, что? | Wait, what? Say that again.
which one | Который из них? | Which one? The red or the blue?
could you repeat the question | Повторите вопрос | Could you repeat the question, please?
how do you pronounce this word | Как произносится это слово? | How do you pronounce this word?
what's the point | В чём смысл? | I don't get it. What's the point?
I don't get it | Не понимаю, до меня не доходит | I don't get it. Why is that funny?
is that so | Неужели? | "He quit." "Is that so?"
`,
  },
  {
    key: "agree",
    name: "Согласие и несогласие",
    lines: `
I couldn't agree more | Совершенно с тобой согласен | I couldn't agree more. It was a mistake.
fair enough | Справедливо | Fair enough, I'll do it your way.
that makes sense | В этом есть смысл | That makes sense. Thanks for explaining.
I see your point | Я понимаю твою мысль | I see your point, but I disagree.
I'm not so sure | Я не очень уверен | I'm not so sure about that.
you've got a point | В этом ты прав | You've got a point, it is expensive.
not necessarily | Не обязательно | "Expensive means good." "Not necessarily."
I beg to differ | Позволю себе не согласиться | I beg to differ. It was your fault.
that's not how I see it | Я вижу это иначе | That's not how I see it.
exactly | Именно | "So we wait?" "Exactly."
absolutely | Безусловно | "Are you coming?" "Absolutely."
I'm with you on that | В этом я с тобой заодно | I'm with you on that one.
tell me about it | И не говори | "This traffic is awful." "Tell me about it."
you can say that again | Не то слово | "It's cold." "You can say that again."
that's what I thought | Так я и думал | That's what I thought. He lied.
I'm afraid not | Боюсь, что нет | "Is he in?" "I'm afraid not."
I suppose so | Пожалуй, да | "Is it ready?" "I suppose so."
if you say so | Раз ты так говоришь | If you say so, but I'm not convinced.
it depends | Смотря по обстоятельствам | "Is it safe?" "It depends."
up to a point | До определённой степени | I agree with you up to a point.
that's a good point | Хорошее замечание | That's a good point, I hadn't thought of it.
I disagree | Я не согласен | I disagree. We should wait.
don't get me wrong | Не пойми меня неправильно | Don't get me wrong, I like him.
be that as it may | Как бы то ни было | Be that as it may, we must go.
that's debatable | Это спорный вопрос | That's debatable.
I'm on the fence | Я пока не определился | I'm on the fence about the job.
it's a matter of opinion | Это вопрос мнения | Which is best? It's a matter of opinion.
I couldn't care less | Мне совершенно безразлично | I couldn't care less what they think.
whatever you say | Как скажешь | Whatever you say, boss.
suit yourself | Поступай как знаешь | Suit yourself, I'm staying.
that's right | Верно | That's right, he left at six.
sounds good | Звучит неплохо | Dinner at eight? Sounds good.
works for me | Меня устраивает | Friday works for me.
I'll go along with that | Я с этим соглашусь | I'll go along with that plan.
that's for sure | Это точно | It'll be hard, that's for sure.
`,
  },
  {
    key: "feel",
    name: "Мнения и чувства",
    lines: `
to be honest | Честно говоря | To be honest, I didn't like it.
if you ask me | По-моему | If you ask me, he's lying.
as far as I'm concerned | Что касается меня | As far as I'm concerned, it's over.
I'm fed up with | Мне надоело | I'm fed up with this rain.
I can't stand | Терпеть не могу | I can't stand loud music.
I'm into | Я увлекаюсь | I'm into jazz these days.
I'm not a big fan of | Я не любитель | I'm not a big fan of spicy food.
it's not my cup of tea | Это не моё | Opera? It's not my cup of tea.
I'm looking forward to | Жду с нетерпением | I'm looking forward to the weekend.
I'm over the moon | Я на седьмом небе | I'm over the moon about the news.
I feel like | Мне хочется | I feel like going for a walk.
I'm dying to | Мне до смерти хочется | I'm dying to see the new film.
I'm crazy about | Я без ума от | I'm crazy about her.
I'm sick of | Меня тошнит от | I'm sick of this weather.
it's driving me crazy | Это сводит меня с ума | Stop that, it's driving me crazy.
I'm a bit nervous | Я немного нервничаю | I'm a bit nervous about the exam.
I'm scared to death | Я до смерти напуган | I'm scared to death of spiders.
I'm worried about | Я беспокоюсь о | I'm worried about my brother.
I feel terrible | Мне ужасно плохо | I feel terrible about what I said.
I'm so proud of you | Я так тобой горжусь | I'm so proud of you, son.
I'd rather | Я бы предпочёл | I'd rather stay home tonight.
I'd love to | С удовольствием | "Join us?" "I'd love to."
I wish I could | Хотел бы я, чтобы это было возможно | I wish I could help you.
I can't help it | Ничего не могу с собой поделать | I can't help it, I'm curious.
I don't mind | Я не против | I don't mind waiting.
it means a lot to me | Для меня это много значит | It means a lot to me that you came.
it's a pity | Жаль | It's a pity you can't stay.
what a shame | Какая досада | What a shame, it was a great show.
I'm heartbroken | У меня разбито сердце | I'm heartbroken that he left.
I'm in a good mood | Я в хорошем настроении | I'm in a good mood today.
I'm not in the mood | Мне не до того | I'm not in the mood for jokes.
I'm all ears | Я весь внимание | Go on, I'm all ears.
I'm lost for words | Я не нахожу слов | I'm lost for words.
I have mixed feelings | У меня смешанные чувства | I have mixed feelings about moving.
I can't wait | Не могу дождаться | I can't wait to see you.
I'm thrilled | Я в восторге | I'm thrilled to be here.
I'm disappointed | Я разочарован | I'm disappointed in you.
`,
  },
  {
    key: "react",
    name: "Реакции",
    lines: `
no way | Не может быть | No way! You won the lottery?
you're kidding | Ты шутишь | You're kidding! He's twenty?
seriously | Серьёзно? | Seriously? You did that?
that's crazy | Это безумие | Three exams in a day? That's crazy.
oh my God | Боже мой | Oh my God, look at that!
I can't believe it | Не могу в это поверить | I can't believe it, we won!
what a relief | Какое облегчение | What a relief, it's over.
good for you | Молодец | You got the job? Good for you!
lucky you | Тебе повезло | Lucky you, you're on holiday.
poor thing | Бедняжка | Poor thing, she's so tired.
that's too bad | Вот не повезло | That's too bad about your car.
bummer | Какая обида | Bummer, the shop is closed.
gross | Фу, гадость | Gross! There's a hair in my soup.
holy cow | Ого | Holy cow, that's expensive!
thank God | Слава богу | Thank God you're safe.
that's awesome | Это круто | You passed? That's awesome!
how awful | Какой ужас | How awful, I'm so sorry.
oh dear | Ох, беда | Oh dear, I've lost my keys.
oops | Ой | Oops, I dropped it.
whoa, slow down | Эй, не так быстро | Whoa, slow down, I can't follow.
give me a break | Хватит издеваться | Give me a break, that's not true.
come on | Ну давай же | Come on, we'll be late.
get out of here | Да ну тебя | Get out of here! Really?
guess what | Угадай что | Guess what? I got engaged.
you won't believe this | Ты не поверишь | You won't believe this, but he called.
believe it or not | Верьте или нет | Believe it or not, I like early mornings.
wait a minute | Погоди-ка | Wait a minute, that's my coat.
you must be joking | Ты, должно быть, шутишь | You must be joking, it costs a fortune.
unbelievable | Невероятно | Unbelievable! He did it again.
not again | Только не опять | Not again, the train is late.
here we go again | Опять началось | Here we go again, the same old argument.
what a surprise | Вот так сюрприз | What a surprise to see you here!
speak of the devil | Лёгок на помине | Speak of the devil, here he comes.
I knew it | Я так и знал | I knew it, he forgot.
told you so | Я же говорил | Told you so, it rained.
how funny | Как забавно | How funny, we're wearing the same shirt.
what a coincidence | Какое совпадение | What a coincidence, we're on the same flight.
`,
  },
  {
    key: "polite",
    name: "Спасибо, извинения, вежливость",
    lines: `
thanks a lot | Большое спасибо | Thanks a lot for the lift.
I appreciate it | Я это ценю | I appreciate it, really.
don't mention it | Не стоит благодарности | "Thanks!" "Don't mention it."
no worries | Без проблем | "Sorry I'm late." "No worries."
it's no big deal | Ничего страшного | It's no big deal, honestly.
my bad | Моя вина | Oh, my bad, I took your seat.
I'm sorry to hear that | Мне жаль это слышать | I'm sorry to hear that. Is she okay?
excuse me | Извините | Excuse me, where is the station?
pardon me | Прошу прощения | Pardon me, may I get past?
after you | После вас | After you, please.
bless you | Будь здоров | "Achoo!" "Bless you."
you're welcome | Пожалуйста | "Thank you." "You're welcome."
sorry for the mess | Извини за беспорядок | Sorry for the mess, I wasn't expecting guests.
I owe you one | Я твой должник | Thanks, I owe you one.
help yourself | Угощайтесь | There's cake, help yourself.
thanks for having me | Спасибо, что пригласили | Thanks for having me, it was lovely.
that's very kind of you | Очень любезно с вашей стороны | That's very kind of you.
it's the least I can do | Это самое малое, что я могу сделать | It's the least I can do after all you did.
sorry to bother you | Извините за беспокойство | Sorry to bother you, but I need help.
sorry I'm late | Извини, что опоздал | Sorry I'm late, the bus broke down.
I didn't mean to | Я не хотел | I didn't mean to hurt you.
please forgive me | Пожалуйста, прости меня | Please forgive me, I was wrong.
no hard feelings | Без обид | No hard feelings, okay?
never mind | Забудь, неважно | Never mind, I'll do it myself.
forget it | Проехали | Forget it, it's not important.
it's my pleasure | Мне только в радость | It's my pleasure to help.
not at all | Нисколько | "Do you mind?" "Not at all."
much obliged | Весьма признателен | Much obliged for your help.
thanks anyway | Всё равно спасибо | Thanks anyway, I'll find it.
sorry about that | Прости за это | Sorry about that, I wasn't looking.
I'm really sorry | Мне искренне жаль | I'm really sorry for your loss.
don't worry about it | Не переживай об этом | Don't worry about it, it's fine.
excuse my French | Простите за грубое слово | Excuse my French, but he's an idiot.
with all due respect | При всём уважении | With all due respect, sir, you're wrong.
thanks for your patience | Спасибо за терпение | Thanks for your patience, everyone.
`,
  },
  {
    key: "ask",
    name: "Просьбы и предложения",
    lines: `
could you do me a favor | Не окажешь мне услугу? | Could you do me a favor and hold this?
would you mind | Вы не возражаете? | Would you mind opening the window?
do you mind if I | Ты не против, если я | Do you mind if I sit here?
how about | Как насчёт | How about a walk after dinner?
why don't we | Почему бы нам не | Why don't we eat out tonight?
let's go for it | Давай рискнём | Let's go for it, what can we lose?
shall we | Пойдём? | The taxi is here. Shall we?
feel free to | Не стесняйтесь | Feel free to ask questions.
let me know | Дай мне знать | Let me know when you're ready.
can I get you anything | Принести тебе что-нибудь? | Can I get you anything to drink?
it's on me | Это за мой счёт | Put your wallet away, it's on me.
let me give you a hand | Давай помогу | Let me give you a hand with those bags.
I'll take care of it | Я этим займусь | Don't worry, I'll take care of it.
count me in | Считай, я с вами | Going to the cinema? Count me in.
count me out | Меня в расчёт не бери | Camping in winter? Count me out.
I'm in | Я за | A road trip? I'm in.
I'll pass | Я пас | Dessert? I'll pass, thanks.
let's split the bill | Давай разделим счёт | Let's split the bill.
let's get together | Давай соберёмся | Let's get together next week.
let's grab a bite | Давай перекусим | Let's grab a bite before the film.
let's call it a night | Давай на сегодня закончим | It's late, let's call it a night.
let's get started | Давайте начнём | Everyone's here, let's get started.
let's get down to business | Давайте к делу | Let's get down to business.
why not | А почему бы и нет? | "Fancy a swim?" "Why not?"
I'd be happy to | Буду рад | I'd be happy to help.
can I take a message | Что-нибудь передать? | He's out. Can I take a message?
could you hold the line | Не кладите трубку | Could you hold the line, please?
can you give me a ride | Подбросишь меня? | Can you give me a ride to the airport?
I'll give you a lift | Я тебя подвезу | I'll give you a lift home.
would you like some more | Хотите ещё? | Would you like some more tea?
I'll have the same | Мне то же самое | I'll have the same as her.
what would you recommend | Что бы вы порекомендовали? | What would you recommend for dessert?
can I have the check | Можно счёт? | Can I have the check, please?
keep the change | Сдачи не надо | Here's twenty, keep the change.
it's my treat | Я угощаю | Put it away, it's my treat.
do you have a minute | У тебя есть минутка? | Do you have a minute?
do you want to come along | Хочешь пойти с нами? | Do you want to come along?
I'll see what I can do | Посмотрю, что смогу сделать | I'll see what I can do.
just say the word | Только скажи | Just say the word and I'll come.
you can count on me | Можешь на меня рассчитывать | You can count on me.
`,
  },
  {
    key: "time",
    name: "Время и планы",
    lines: `
I'm running late | Я опаздываю | Sorry, I'm running late.
I'm on my way | Я уже в пути | I'm on my way, wait for me.
see you then | Тогда до встречи | Saturday at six? See you then.
let's meet up | Давай встретимся | Let's meet up after work.
I'll be right back | Я сейчас вернусь | Wait here, I'll be right back.
hold on | Подожди секунду | Hold on, I'll check.
give me a second | Дай мне секунду | Give me a second to think.
it's about time | Давно пора | It's about time you called.
just in case | На всякий случай | Take an umbrella just in case.
sooner or later | Рано или поздно | Sooner or later he'll find out.
in the meantime | А пока | In the meantime, let's eat.
by the way | Кстати | By the way, who's that man?
at the moment | В данный момент | He's busy at the moment.
on the other hand | С другой стороны | On the other hand, it's cheap.
in a hurry | В спешке | Sorry, I'm in a hurry.
right away | Немедленно | Come here right away.
any minute now | С минуты на минуту | He'll be here any minute now.
once in a while | Изредка | We eat out once in a while.
every now and then | Время от времени | He visits every now and then.
for the time being | Пока что | For the time being, stay here.
as soon as possible | Как можно скорее | Call me as soon as possible.
at the last minute | В последнюю минуту | They cancelled at the last minute.
ahead of time | Заранее | Book the tickets ahead of time.
on time | Вовремя | The train arrived on time.
in no time | Мигом | We'll be there in no time.
what time works for you | Какое время тебе удобно? | What time works for you?
how long does it take | Сколько это занимает? | How long does it take to get there?
it takes forever | Это тянется целую вечность | It takes forever to load.
it's up to you | Решать тебе | It's up to you.
it's up in the air | Это пока не решено | Where we go? It's up in the air.
we'll see | Посмотрим | "Can I go?" "We'll see."
I'll think about it | Я подумаю об этом | I'll think about it.
let's play it by ear | Будем смотреть по обстоятельствам | We have no plan, let's play it by ear.
it's getting late | Становится поздно | It's getting late, let's go.
time flies | Время летит | Time flies when you're having fun.
time's up | Время вышло | Stop writing, time's up.
better late than never | Лучше поздно, чем никогда | You came, better late than never.
take your time | Не торопись | Take your time, there's no rush.
hurry up | Поторопись | Hurry up, we'll miss the train.
wait for me | Подожди меня | Wait for me at the gate.
`,
  },
  {
    key: "links",
    name: "Связки речи",
    lines: `
you know | Знаешь | It was, you know, a bit strange.
I mean | То есть | I mean, it's not that bad.
kind of | Вроде как | I'm kind of tired.
sort of | Отчасти | "Did you like it?" "Sort of."
actually | Вообще-то | Actually, I prefer tea.
basically | В сущности | Basically, we have no choice.
anyway | В любом случае | Anyway, let's move on.
speaking of which | Кстати о том | Speaking of which, where is Tom?
come to think of it | Если подумать | Come to think of it, I did see him.
to be fair | Справедливости ради | To be fair, he tried his best.
the thing is | Дело в том, что | The thing is, I have no money.
the point is | Суть в том, что | The point is, we're late.
long story short | Короче говоря | Long story short, we missed the flight.
for what it's worth | Если это чего-то стоит | For what it's worth, I think you're right.
as a matter of fact | Фактически | As a matter of fact, I live next door.
mind you | Впрочем | Mind you, it was cheap.
needless to say | Нечего и говорить | Needless to say, he was furious.
to tell you the truth | По правде говоря | To tell you the truth, I forgot.
on second thought | Поразмыслив | On second thought, let's walk.
now that you mention it | Раз ты об этом заговорил | Now that you mention it, I am hungry.
having said that | Тем не менее | Having said that, I still like him.
as I was saying | Как я уже говорил | As I was saying, it's too late.
more or less | Более или менее | It's finished, more or less.
or something | Или что-то вроде того | Maybe he's ill or something.
and so on | И так далее | Salt, pepper, and so on.
and stuff | И всё такое | We watched films and stuff.
you see | Видишь ли | You see, it's not that simple.
let me think | Дай подумать | Let me think about that.
apparently | Судя по всему | Apparently, he moved to Spain.
literally | Буквально | I literally died laughing.
frankly | Откровенно говоря | Frankly, I don't care.
if I were you | На твоём месте | If I were you, I'd say yes.
in my opinion | По моему мнению | In my opinion, it's too long.
to sum up | Подводя итог | To sum up, we need more time.
first of all | Прежде всего | First of all, thank you.
last but not least | И последнее, но не менее важное | Last but not least, I want to thank my wife.
all in all | В целом | All in all, it was a good trip.
by any chance | Случайно | Do you, by any chance, have a pen?
at least | По крайней мере | At least he said sorry.
after all | В конце концов | After all, he's only a child.
in the end | В итоге | In the end, we stayed home.
all of a sudden | Внезапно | All of a sudden, the lights went out.
no matter what | Несмотря ни на что | I'll support you no matter what.
the other day | На днях | I saw him the other day.
these days | В наши дни | Nobody writes letters these days.
from now on | Отныне | From now on, I'll be careful.
so far | До сих пор | So far, so good.
for sure | Наверняка | I don't know for sure.
no doubt | Без сомнения | No doubt he'll come.
`,
  },
  {
    key: "life",
    name: "Бытовые ситуации",
    lines: `
I'm stuck | Я застрял | I'm stuck, can you help me?
I've had enough | С меня хватит | I've had enough of this noise.
it's not working | Это не работает | It's not working, try again.
I can't make it | Я не смогу прийти | Sorry, I can't make it tonight.
I have no idea | Понятия не имею | I have no idea where he is.
I haven't got a clue | Ни малейшего представления | I haven't got a clue what to do.
it slipped my mind | Вылетело из головы | Sorry, it slipped my mind.
I lost track of time | Я потерял счёт времени | I lost track of time, sorry.
I'm broke | Я на мели | I'm broke until Friday.
I'm starving | Я умираю с голоду | I'm starving, let's eat.
I'm exhausted | Я без сил | I'm exhausted after the trip.
I'm swamped | Я завален делами | I'm swamped with work this week.
I'm worn out | Я вымотан | I'm worn out, I need sleep.
what's the matter | В чём дело? | You look upset. What's the matter?
what's wrong | Что случилось? | What's wrong? You're pale.
are you okay | Ты в порядке? | You fell! Are you okay?
hang in there | Держись | Hang in there, it gets better.
cheer up | Выше нос | Cheer up, it's not the end.
get well soon | Скорее поправляйся | Get well soon, we miss you.
I'm not feeling well | Мне нездоровится | I'm not feeling well today.
I've got a headache | У меня болит голова | I've got a headache, I'm going to lie down.
I caught a cold | Я простудился | I caught a cold last week.
I can't sleep | Не могу уснуть | I can't sleep, it's too hot.
I overslept | Я проспал | I overslept and missed the bus.
I missed the bus | Я опоздал на автобус | I missed the bus, so I walked.
I got lost | Я заблудился | I got lost in the old town.
I forgot my keys | Я забыл ключи | I forgot my keys again.
my phone is dead | У меня сел телефон | My phone is dead, can I borrow yours?
there's something wrong with | Что-то не так с | There's something wrong with my laptop.
it's out of order | Не работает, сломано | Don't wait for the lift, it's out of order.
it's a long shot | Шансов мало | It's a long shot, but let's try.
I'm in trouble | У меня неприятности | I'm in trouble with my boss.
I'm on a diet | Я на диете | I'm on a diet, no cake for me.
I'm off today | У меня сегодня выходной | I'm off today, let's meet.
I'm new here | Я здесь новенький | I'm new here, can you show me around?
I need some air | Мне нужно подышать | I need some air, I'll be outside.
I'm just looking | Я просто смотрю | I'm just looking, thanks.
is this seat taken | Это место занято? | Is this seat taken?
where is the restroom | Где туалет? | Excuse me, where is the restroom?
how much is it | Сколько это стоит? | How much is it, please?
do you take cards | Вы принимаете карты? | Do you take cards here?
is there anything else | Что-нибудь ещё? | Is there anything else you need?
I have an appointment | Я записан на приём | I have an appointment at ten.
I'd like to make a reservation | Я хотел бы забронировать столик | I'd like to make a reservation for two.
`,
  },
  {
    key: "work",
    name: "Работа и учёба",
    lines: `
I'll get back to you | Я вам отвечу позже | I'll get back to you tomorrow.
let's touch base | Давайте сверимся | Let's touch base on Monday.
keep me posted | Держи меня в курсе | Keep me posted on the results.
I'm on it | Я этим занимаюсь | I'm on it, don't worry.
I'll look into it | Я разберусь | I'll look into it today.
we're on the same page | Мы на одной волне | Good, we're on the same page.
let's take it from the top | Давайте с самого начала | Let's take it from the top.
good job | Хорошая работа | Good job, everyone!
well done | Отлично сработано | Well done, you passed.
nice work | Отличный результат | Nice work on the report.
I'm in a meeting | Я на совещании | I'm in a meeting, call me later.
let's wrap it up | Давайте закругляться | It's late, let's wrap it up.
let's move on | Идём дальше | Okay, let's move on.
I have a question | У меня вопрос | Sorry, I have a question.
can I interrupt you for a second | Можно вас на секунду перебить? | Can I interrupt you for a second?
let me finish | Дай мне закончить | Let me finish, please.
go ahead | Прошу, продолжайте | Go ahead, I'm listening.
that's a good question | Хороший вопрос | That's a good question, let me think.
please find attached | Во вложении | Please find attached the contract.
looking forward to hearing from you | Жду вашего ответа | Looking forward to hearing from you.
sorry for the delay | Извините за задержку | Sorry for the delay in replying.
thanks in advance | Заранее спасибо | Thanks in advance for your help.
best regards | С наилучшими пожеланиями | Best regards, Anna.
I'm in charge of | Я отвечаю за | I'm in charge of the new project.
it's part of my job | Это входит в мои обязанности | It's part of my job, don't thank me.
it's out of my hands | Это не в моих силах | Sorry, it's out of my hands.
let's agree to disagree | Останемся каждый при своём | We'll never agree, so let's agree to disagree.
I'll sleep on it | Утро вечера мудренее | I'll sleep on it and tell you tomorrow.
it's a piece of cake | Проще простого | Don't worry, it's a piece of cake.
let's play it safe | Не будем рисковать | Let's play it safe and leave early.
let's keep it simple | Давайте без усложнений | Let's keep it simple.
that's not my job | Это не моя работа | That's not my job, ask Tom.
I'm a quick learner | Я быстро учусь | Don't worry, I'm a quick learner.
practice makes perfect | Повторенье — мать ученья | Keep going, practice makes perfect.
I'm studying for an exam | Я готовлюсь к экзамену | I'm studying for an exam tomorrow.
I failed the test | Я провалил экзамен | I failed the test again.
I passed with flying colors | Я сдал блестяще | I passed with flying colors.
I'm working on it | Я над этим работаю | I'm working on it right now.
it's a tight deadline | Сроки жёсткие | It's a tight deadline, but we can do it.
`,
  },
  {
    key: "brit",
    name: "Британская речь",
    lines: `
bloody hell | Чёрт возьми | Bloody hell, that was close!
fancy a drink | Не хочешь выпить? | Fancy a drink after work?
I'm knackered | Я без задних ног | I'm knackered, I'm going to bed.
I'm gutted | Я убит горем (очень расстроен) | I'm gutted we lost.
that's daft | Это глупость | That's daft, nobody does that.
cheeky | Нахальный | Don't be cheeky.
get lost | Пропади, убирайся | Get lost, I'm busy.
mind your own business | Не лезь не в своё дело | Mind your own business, mate.
you're having a laugh | Ты, наверное, смеёшься | You're having a laugh, it's miles away.
give over | Хватит дурачиться | Give over, you're annoying me.
keep your hair on | Не кипятись | Keep your hair on, I'm only joking.
cheers, mate | Спасибо, приятель | Cheers, mate, I owe you a pint.
that's brilliant | Это здорово | That's brilliant, well done.
fancy a cuppa | Выпьешь чаю? | Fancy a cuppa?
you're taking the mickey | Ты надо мной смеёшься | You're taking the mickey, aren't you?
it's not fair | Это нечестно | It's not fair, I was first.
I haven't the foggiest | Ни бум-бум | I haven't the foggiest what he means.
that's rubbish | Это чушь | That's rubbish, I never said that.
pull yourself together | Возьми себя в руки | Pull yourself together, man.
leave it out | Брось, прекрати | Leave it out, you're scaring her.
you what | Чего-чего? | You what? I didn't hear that.
right then | Ну что ж | Right then, shall we begin?
cheerio | Покеда | Cheerio, see you tomorrow.
blimey | Ничего себе | Blimey, look at the size of it!
bob's your uncle | И дело в шляпе | Add water and Bob's your uncle.
don't be daft | Не говори глупостей | Don't be daft, of course you can.
it's chucking it down | Льёт как из ведра | It's chucking it down out there.
I'm off to the pub | Я пошёл в паб | I'm off to the pub, back later.
come off it | Да брось ты | Come off it, you know that's not true.
I'll be there in a tick | Буду через секунду | I'll be there in a tick.
fair play | Честь и хвала | Fair play to him, he apologised.
good on you | Так держать | You finished the marathon? Good on you!
do you reckon | Как думаешь? | Do you reckon it'll rain?
I reckon | Полагаю | I reckon he's lying.
look sharp | Живее | Look sharp, the boss is coming.
mind how you go | Счастливого пути | Mind how you go, it's icy.
bollocks | Чушь собачья | That's bollocks and you know it.
piss off | Отвали | Piss off, I'm not interested.
oi | Эй ты | Oi, get off my car!
mind your manners | Следи за манерами | Mind your manners in front of the guests.
watch your tongue | Придержи язык | Watch your tongue, boy.
what's it to you | Тебе-то что? | What's it to you who I meet?
over my dead body | Только через мой труп | You'll sell it over my dead body.
cut it out | Прекрати | Cut it out, that hurts.
don't push your luck | Не испытывай судьбу | Don't push your luck, son.
you have my word | Даю слово | You have my word, I'll be there.
leave it with me | Предоставь это мне | Leave it with me, I'll sort it.
hold your horses | Не гони лошадей | Hold your horses, we haven't decided.
a word, please | Можно вас на пару слов? | A word, please, in private.
`,
  },
];
