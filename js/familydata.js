// familydata.js — семьи слов для задания «Семья слов» (js/families.js): однокоренные слова разных частей речи.
//
// Одна строка — одна семья. Слово записано с частью речи после точки:
//   v глагол, n существительное, p человек (writer, ruler), adj прилагательное, adv наречие.
// Если слово бывает двумя частями речи, они перечислены через запятую: hope.v,n.
// Формы одного слова (grows, grew) сюда не входят: ими занимается задание «Форма слова» (js/forms.js).
// Берутся только слова, которые есть в вашем словаре отдельными статьями; остальные члены семьи молча пропускаются.
// Правила (проверяет tests/families.test.mjs): слово встречается только в одной семье, в семье не меньше трёх слов,
// английские слова пишутся строчными латинскими буквами в американском написании.
export const FAMILY_LINES = `
absence.n absent.adj absently.adv
accept.v acceptance.n acceptable.adj acceptably.adv
accident.n accidental.adj accidentally.adv
accomplish.v accomplishment.n accomplished.adj
accurate.adj accuracy.n accurately.adv
achieve.v achievement.n achiever.p
act.v,n action.n actor.p active.adj actively.adv activity.n
add.v addition.n additional.adj additionally.adv
admire.v admiration.n admirer.p admirable.adj admirably.adv
advantage.n advantageous.adj disadvantage.n
adventure.n adventurous.adj adventurer.p
advise.v advice.n adviser.p advisable.adj
affect.v effect.n effective.adj effectively.adv
agree.v agreement.n agreeable.adj agreeably.adv
amaze.v amazement.n amazing.adj amazingly.adv
ambition.n ambitious.adj ambitiously.adv
amuse.v amusement.n amusing.adj
ancestor.p ancestry.n ancestral.adj
anger.v,n angry.adj angrily.adv
announce.v announcement.n announcer.p
annoy.v annoyance.n annoying.adj
anxious.adj anxiety.n anxiously.adv
apologize.v apology.n apologetic.adj apologetically.adv
appear.v appearance.n apparent.adj apparently.adv
appreciate.v appreciation.n appreciative.adj
argue.v argument.n argumentative.adj
art.n artist.p artistic.adj artistically.adv
assist.v assistance.n assistant.p
attend.v attention.n attendance.n attentive.adj attentively.adv
attract.v attraction.n attractive.adj attractively.adv
authority.n authorize.v authoritative.adj
bake.v baker.p bakery.n
beauty.n beautiful.adj beautifully.adv
begin.v beginning.n beginner.p
believe.v belief.n believable.adj
betray.v betrayal.n betrayer.p
bitter.adj bitterness.n bitterly.adv
bless.v blessing.n blessed.adj
blind.adj blindness.n blindly.adv
blood.n bleed.v bloody.adj
bold.adj boldness.n boldly.adv
bore.v boredom.n boring.adj
brave.adj bravery.n bravely.adv
breathe.v breath.n breathless.adj breathlessly.adv
bright.adj brightness.n brightly.adv brighten.v
build.v builder.p building.n
busy.adj business.n busily.adv
calculate.v calculation.n calculator.p
capture.v,n captive.adj captor.p captivity.n
care.v,n careful.adj carefully.adv careless.adj carelessly.adv
cautious.adj caution.n cautiously.adv
celebrate.v celebration.n celebrity.p
certain.adj certainty.n certainly.adv
challenge.v,n challenging.adj challenger.p
cheer.v,n cheerful.adj cheerfully.adv
clear.adj,v clarity.n clearly.adv
clever.adj cleverness.n cleverly.adv
close.v,adj closeness.n closely.adv closure.n
cold.adj coldness.n coldly.adv
collect.v collection.n collector.p
communicate.v communication.n communicative.adj
compare.v comparison.n comparative.adj comparatively.adv
compete.v competition.n competitor.p competitive.adj
complete.v,adj completion.n completely.adv
confident.adj confidence.n confidently.adv
confuse.v confusion.n confusing.adj
conquer.v conquest.n conqueror.p
conscious.adj consciousness.n consciously.adv
consider.v consideration.n considerable.adj considerably.adv considerate.adj
continue.v continuation.n continuous.adj continuously.adv
contribute.v contribution.n contributor.p
convince.v conviction.n convincing.adj
courage.n courageous.adj courageously.adv
coward.p cowardice.n cowardly.adj
crazy.adj craziness.n crazily.adv
create.v creation.n creator.p creative.adj creatively.adv
crime.n criminal.adj,p criminally.adv
cruel.adj cruelty.n cruelly.adv
culture.n cultural.adj culturally.adv
curious.adj curiosity.n curiously.adv
custom.n customer.p customary.adj
danger.n dangerous.adj dangerously.adv endanger.v
dark.adj darkness.n darken.v darkly.adv
deaf.adj deafness.n deafen.v
deceive.v deception.n deceptive.adj deceit.n
decide.v decision.n decisive.adj decisively.adv
decorate.v decoration.n decorative.adj
dedicate.v dedication.n dedicated.adj
deep.adj depth.n deeply.adv deepen.v
defy.v defiance.n defiant.adj defiantly.adv
delight.v,n delightful.adj delightfully.adv
depend.v dependence.n dependent.adj dependable.adj
depress.v depression.n depressing.adj
describe.v description.n descriptive.adj
desire.v,n desirable.adj desirably.adv
despair.v,n desperate.adj desperately.adv desperation.n
destroy.v destruction.n destroyer.p destructive.adj
determine.v determination.n determined.adj
develop.v development.n developer.p
devote.v devotion.n devoted.adj devotedly.adv
die.v death.n dead.adj deadly.adj
differ.v difference.n different.adj differently.adv
direct.v,adj direction.n director.p directly.adv
disappoint.v disappointment.n disappointing.adj
disaster.n disastrous.adj disastrously.adv
discover.v discovery.n discoverer.p
distance.n distant.adj distantly.adv
disturb.v disturbance.n disturbing.adj
doubt.v,n doubtful.adj doubtfully.adv doubtless.adj
dream.v,n dreamer.p dreamy.adj dreamily.adv
drink.v,n drinker.p drunk.adj drunkenly.adv drunkenness.n
dull.adj dullness.n dully.adv
duty.n dutiful.adj dutifully.adv
eager.adj eagerness.n eagerly.adv
easy.adj ease.n easily.adv
educate.v education.n educational.adj educator.p
elect.v election.n elector.p
electric.adj electricity.n electrician.p
elegant.adj elegance.n elegantly.adv
embarrass.v embarrassment.n embarrassing.adj
emotion.n emotional.adj emotionally.adv
emphasis.n emphasize.v emphatic.adj emphatically.adv
empire.n emperor.p imperial.adj
employ.v employment.n employer.p
encourage.v encouragement.n encouraging.adj
end.v,n endless.adj endlessly.adv ending.n
energy.n energetic.adj energetically.adv
enjoy.v enjoyment.n enjoyable.adj
enter.v entrance.n entry.n
entertain.v entertainment.n entertainer.p entertaining.adj
envy.v,n envious.adj enviously.adv
equal.adj,v equality.n equally.adv
essence.n essential.adj essentially.adv
eternal.adj eternity.n eternally.adv
evidence.n evident.adj evidently.adv
exact.adj exactly.adv exactness.n
examine.v examination.n examiner.p
exception.n exceptional.adj exceptionally.adv
excite.v excitement.n exciting.adj excitedly.adv
exhaust.v exhaustion.n exhausting.adj
expect.v expectation.n unexpected.adj unexpectedly.adv
expense.n expensive.adj expensively.adv
explore.v exploration.n explorer.p
express.v expression.n expressive.adj
extreme.adj extremely.adv extremist.p extremity.n
faith.n faithful.adj faithfully.adv
fame.n famous.adj famously.adv
family.n familiar.adj familiarity.n
fashion.n fashionable.adj fashionably.adv
fault.n faulty.adj faultless.adj
fear.v,n fearful.adj fearfully.adv fearless.adj
fertile.adj fertility.n fertilize.v
fierce.adj fierceness.n fiercely.adv
fill.v full.adj fully.adv fullness.n
flatter.v flattery.n flatterer.p
fool.v,n,p foolish.adj foolishly.adv foolishness.n
force.v,n forceful.adj forcefully.adv
forget.v forgetful.adj forgetfulness.n
forgive.v forgiveness.n forgiving.adj
fortune.n fortunate.adj fortunately.adv
free.adj,v freedom.n freely.adv
frequent.adj frequency.n frequently.adv
fresh.adj freshness.n freshly.adv freshen.v
friend.n,p friendly.adj friendship.n
fright.n frighten.v frightening.adj
fun.n funny.adj funnily.adv
fury.n furious.adj furiously.adv
generous.adj generosity.n generously.adv
gentle.adj gentleness.n gently.adv
glad.adj gladness.n gladly.adv
gloom.n gloomy.adj gloomily.adv
glory.n glorious.adj gloriously.adv glorify.v
govern.v government.n governor.p
grace.n graceful.adj gracefully.adv
gradual.adj gradually.adv graduate.v graduation.n
grand.adj grandeur.n grandly.adv
grateful.adj gratitude.n gratefully.adv
great.adj greatness.n greatly.adv
greed.n greedy.adj greedily.adv
grow.v growth.n grower.p
guilt.n guilty.adj guiltily.adv
habit.n habitual.adj habitually.adv
happy.adj happiness.n happily.adv
hard.adj,adv hardness.n harden.v hardship.n
harm.v,n harmful.adj harmless.adj
harsh.adj harshness.n harshly.adv
haste.n hasty.adj hastily.adv hasten.v
hate.v,n hatred.n hateful.adj
heal.v health.n healthy.adj healthily.adv healer.p
heart.n hearty.adj heartily.adv heartless.adj
heat.v,n hot.adj hotly.adv
heavy.adj heaviness.n heavily.adv
help.v,n helper.p helpful.adj helpless.adj helpfully.adv helplessly.adv
hero.p heroic.adj heroism.n heroically.adv
hesitate.v hesitation.n hesitant.adj hesitantly.adv
high.adj height.n highly.adv heighten.v
history.n historian.p historical.adj historically.adv
home.n homeless.adj homelessness.n
honest.adj honesty.n honestly.adv
hope.v,n hopeful.adj hopeless.adj hopefully.adv hopelessly.adv
horror.n horrible.adj horribly.adv horrify.v horrific.adj
human.adj,p humanity.n humanly.adv
humble.adj humility.n humbly.adv
hunger.n,v hungry.adj hungrily.adv
hurry.v,n hurried.adj hurriedly.adv
identify.v identity.n identification.n identical.adj
idle.adj idleness.n idly.adv
ignore.v ignorance.n ignorant.adj
imagine.v imagination.n imaginary.adj imaginative.adj
important.adj importance.n importantly.adv
impress.v impression.n impressive.adj impressively.adv
include.v inclusion.n inclusive.adj
independent.adj independence.n independently.adv
individual.n,adj individually.adv individuality.n
industry.n industrial.adj industrious.adj
inform.v information.n informative.adj
inherit.v inheritance.n heir.p
injure.v injury.n injured.adj
innocent.adj innocence.n innocently.adv
insane.adj insanity.n insanely.adv
insist.v insistence.n insistent.adj
inspire.v inspiration.n inspiring.adj inspirational.adj
instruct.v instruction.n instructor.p
intelligent.adj intelligence.n intelligently.adv
intend.v intention.n intentional.adj intentionally.adv
intense.adj intensity.n intensely.adv intensify.v
interest.v,n interesting.adj interestingly.adv
intrude.v intruder.p intrusion.n
invade.v invasion.n invader.p
invent.v invention.n inventor.p
invite.v invitation.n inviting.adj
isolate.v isolation.n isolated.adj
jealous.adj jealousy.n jealously.adv
joy.n joyful.adj joyfully.adv
just.adj justice.n justly.adv justify.v
keen.adj keenly.adv keenness.n
kill.v killer.p killing.n
kind.adj kindness.n kindly.adv
king.p kingdom.n kingly.adj
knight.p knighthood.n knightly.adj
know.v knowledge.n knowledgeable.adj
laugh.v,n laughter.n laughable.adj
law.n lawyer.p lawful.adj lawless.adj
lazy.adj laziness.n lazily.adv
lead.v leader.p leadership.n
learn.v learner.p learning.n
legal.adj legality.n legally.adv legalize.v
liberty.n liberate.v liberation.n
limit.v,n limitation.n limitless.adj
live.v life.n alive.adj lively.adj
local.adj locally.adv locate.v location.n
lonely.adj loneliness.n loner.p
long.adj length.n lengthen.v
lose.v loss.n loser.p
loud.adj loudly.adv loudness.n
love.v,n lover.p lovely.adj lovingly.adv
loyal.adj loyalty.n loyally.adv
luck.n lucky.adj luckily.adv unlucky.adj
mad.adj madness.n madly.adv
magic.n magical.adj magician.p magically.adv
man.p manly.adj manhood.n manliness.n
manage.v management.n manager.p manageable.adj
marry.v marriage.n married.adj
marvel.v,n marvelous.adj marvelously.adv
master.v,p mastery.n masterful.adj
mature.adj,v maturity.n maturely.adv
mean.v meaning.n meaningful.adj meaningless.adj
measure.v,n measurement.n measurable.adj
memory.n remember.v memorable.adj
mental.adj mentality.n mentally.adv
mercy.n merciful.adj merciless.adj mercifully.adv
minister.p ministry.n ministerial.adj
miracle.n miraculous.adj miraculously.adv
miserable.adj misery.n miserably.adv
mock.v mockery.n mocking.adj mockingly.adv
modest.adj modesty.n modestly.adv
monster.n monstrous.adj monstrously.adv
moral.adj,n morality.n morally.adv
mortal.adj,p mortality.n mortally.adv
mother.p motherhood.n motherly.adj
mountain.n mountainous.adj mountaineer.p
mourn.v mourning.n mournful.adj mournfully.adv
move.v,n movement.n movable.adj
murder.v,n murderer.p murderous.adj
music.n musical.adj musician.p musically.adv
mystery.n mysterious.adj mysteriously.adv
nation.n national.adj nationally.adv nationality.n
nature.n natural.adj naturally.adv
neat.adj neatness.n neatly.adv
necessary.adj necessity.n necessarily.adv
neglect.v,n negligent.adj negligence.n
negotiate.v negotiation.n negotiator.p
nerve.n nervous.adj nervously.adv nervousness.n
new.adj newly.adv newness.n news.n
noble.adj nobility.n nobly.adv
noise.n noisy.adj noisily.adv
normal.adj normally.adv normality.n
notice.v,n noticeable.adj noticeably.adv
obey.v obedience.n obedient.adj obediently.adv
observe.v observation.n observer.p
obvious.adj obviously.adv obviousness.n
occupy.v occupation.n occupant.p
odd.adj oddity.n oddly.adv oddness.n
open.v,adj openly.adv openness.n opening.n
operate.v operation.n operator.p
oppose.v opposition.n opponent.p
oppress.v oppression.n oppressor.p oppressive.adj
organize.v organization.n organizer.p
origin.n original.adj originally.adv originate.v originality.n
outrage.n,v outrageous.adj outrageously.adv
own.v,adj owner.p ownership.n
pain.n painful.adj painfully.adv painless.adj
parent.p parental.adj parenthood.n
part.v,n partial.adj partially.adv
passion.n passionate.adj passionately.adv
patient.adj,n patience.n patiently.adv
pay.v,n payment.n payer.p
peace.n peaceful.adj peacefully.adv
peculiar.adj peculiarity.n peculiarly.adv
perfect.adj,v perfection.n perfectly.adv perfectionist.p
perform.v performance.n performer.p
permanent.adj permanence.n permanently.adv
person.n personal.adj personally.adv personality.n
persuade.v persuasion.n persuasive.adj
pity.v,n pitiful.adj pitiless.adj pitifully.adv
play.v,n player.p playful.adj playfully.adv
please.v pleasure.n pleasant.adj pleasantly.adv
poison.v,n poisonous.adj poisoner.p
polite.adj politeness.n politely.adv
politics.n political.adj politician.p politically.adv
pollute.v pollution.n pollutant.n
poor.adj poverty.n poorly.adv
popular.adj popularity.n popularly.adv
possess.v possession.n possessive.adj
possible.adj possibility.n possibly.adv
power.n powerful.adj powerfully.adv powerless.adj
practice.v,n practical.adj practically.adv
precise.adj precisely.adv precision.n
predict.v prediction.n predictable.adj
prefer.v preference.n preferable.adj
press.v,n pressure.n pressing.adj
prevent.v prevention.n preventable.adj preventive.adj
pride.n proud.adj proudly.adv
priest.p priesthood.n priestly.adj
prison.n prisoner.p imprison.v
private.adj privacy.n privately.adv
produce.v product.n production.n producer.p productive.adj
promise.v,n promising.adj promisingly.adv
proper.adj properly.adv property.n
prophet.p prophecy.n prophesy.v prophetic.adj
prosper.v prosperity.n prosperous.adj
protect.v protection.n protector.p protective.adj
prove.v proof.n provable.adj
provide.v provision.n provider.p
public.adj,n publicly.adv publicity.n
publish.v publication.n publisher.p
punish.v punishment.n punishable.adj
pure.adj purity.n purely.adv purify.v
purpose.n purposeful.adj purposely.adv
pursue.v pursuit.n pursuer.p
question.v,n questionable.adj questioning.adj
quick.adj quickly.adv quicken.v quickness.n
quiet.adj,n quietly.adv quietness.n quieten.v
rare.adj rarely.adv rarity.n
rational.adj rationality.n rationally.adv
react.v reaction.n reactive.adj
read.v reader.p readable.adj
ready.adj readiness.n readily.adv
real.adj reality.n really.adv realize.v
reason.n,v reasonable.adj reasonably.adv
rebel.v,p rebellion.n rebellious.adj
receive.v reception.n receiver.p
recognize.v recognition.n recognizable.adj
reflect.v reflection.n reflective.adj
regret.v,n regretful.adj regrettable.adj regretfully.adv
regular.adj regularity.n regularly.adv
relax.v relaxation.n relaxed.adj relaxing.adj
relief.n relieve.v relieved.adj
religion.n religious.adj religiously.adv
rely.v reliable.adj reliance.n reliably.adv
remark.v,n remarkable.adj remarkably.adv
repeat.v repetition.n repeated.adj repeatedly.adv repetitive.adj
resist.v resistance.n resistant.adj
respect.v,n respectful.adj respectable.adj respectfully.adv
respond.v response.n responsive.adj
responsible.adj responsibility.n responsibly.adv
rest.v,n restless.adj restful.adj restlessly.adv
restrict.v restriction.n restrictive.adj
revenge.v,n vengeance.n vengeful.adj
revolt.v,n revolution.n revolutionary.adj
rich.adj riches.n richly.adv
ridicule.v,n ridiculous.adj ridiculously.adv
rob.v robber.p robbery.n
romance.n romantic.adj romantically.adv
rough.adj roughly.adv roughness.n
royal.adj royalty.n royally.adv
rude.adj rudeness.n rudely.adv
sad.adj sadness.n sadly.adv sadden.v
safe.adj safety.n safely.adv
satisfy.v satisfaction.n satisfactory.adj
scandal.n scandalous.adj scandalously.adv
scare.v,n scary.adj scared.adj
science.n scientist.p scientific.adj scientifically.adv
secret.n,adj secrecy.n secretly.adv
select.v selection.n selective.adj
selfish.adj selfishness.n selfishly.adv
sense.v,n sensible.adj sensibly.adv sensitive.adj sensitivity.n
separate.v,adj separation.n separately.adv
serious.adj seriousness.n seriously.adv
serve.v service.n servant.p
settle.v settlement.n settler.p
severe.adj severity.n severely.adv
shame.n,v shameful.adj shameless.adj shamefully.adv
sharp.adj sharpness.n sharply.adv sharpen.v
shock.v,n shocking.adj shockingly.adv
shy.adj shyness.n shyly.adv
sick.adj sickness.n sicken.v
signify.v significance.n significant.adj significantly.adv
silent.adj silence.n silently.adv
simple.adj simplicity.n simply.adv simplify.v
sincere.adj sincerity.n sincerely.adv
sing.v singer.p song.n
slave.p slavery.n enslave.v
sleep.v,n sleeper.p sleepy.adj sleepily.adv sleepless.adj
slight.adj slightly.adv slightness.n
slow.adj,v slowly.adv slowness.n
smoke.v,n smoky.adj smoker.p
society.n social.adj socially.adv
soft.adj softness.n softly.adv soften.v
solemn.adj solemnity.n solemnly.adv
solve.v solution.n solvable.adj
sorrow.n sorrowful.adj sorrowfully.adv
space.n spacious.adj spaciously.adv
speak.v speech.n speaker.p
special.adj specially.adv specialist.p specialize.v
speed.v,n speedy.adj speedily.adv
spirit.n spiritual.adj spirited.adj
stable.adj stability.n stabilize.v
starve.v starvation.n starving.adj
steady.adj steadily.adv steadiness.n
steal.v theft.n thief.p
stern.adj sternly.adv sternness.n
stiff.adj stiffly.adv stiffness.n stiffen.v
stone.n stony.adj stonily.adv
strange.adj strangely.adv stranger.p strangeness.n
strength.n strong.adj strongly.adv strengthen.v
strict.adj strictly.adv strictness.n
stubborn.adj stubbornly.adv stubbornness.n
stupid.adj stupidity.n stupidly.adv
submit.v submission.n submissive.adj
succeed.v success.n successful.adj successfully.adv successor.p
sudden.adj suddenly.adv suddenness.n
suffer.v suffering.n sufferer.p
suffice.v sufficient.adj sufficiently.adv
suggest.v suggestion.n suggestive.adj
support.v,n supporter.p supportive.adj
supreme.adj supremacy.n supremely.adv
surprise.v,n surprising.adj surprisingly.adv
survive.v survival.n survivor.p
suspect.v,n suspicion.n suspicious.adj suspiciously.adv
sustain.v sustainable.adj sustenance.n
swift.adj swiftly.adv swiftness.n
swim.v swimmer.p swimming.n
symbol.n symbolic.adj symbolize.v symbolism.n
sympathy.n sympathetic.adj sympathize.v sympathizer.p
talk.v,n talkative.adj talker.p
taste.v,n tasty.adj tasteless.adj
teach.v teacher.p teaching.n
tempt.v temptation.n tempting.adj tempter.p
tender.adj tenderness.n tenderly.adv
tense.adj tension.n tensely.adv
terror.n terrible.adj terribly.adv terrify.v
theory.n theoretical.adj theorist.p
thick.adj thickness.n thickly.adv thicken.v
thin.adj thinness.n thinly.adv
think.v thought.n thoughtful.adj thoughtfully.adv thoughtless.adj
thirst.n,v thirsty.adj thirstily.adv
threat.n threaten.v threatening.adj threateningly.adv
thunder.n,v thunderous.adj thunderously.adv
tight.adj tightness.n tightly.adv tighten.v
timid.adj timidity.n timidly.adv
tolerate.v tolerance.n tolerant.adj tolerable.adj
touch.v,n touching.adj touchy.adj
tough.adj toughness.n toughen.v
tradition.n traditional.adj traditionally.adv
tragedy.n tragic.adj tragically.adv
train.v,n trainer.p training.n
translate.v translation.n translator.p
treason.n traitor.p treacherous.adj treachery.n
triumph.v,n triumphant.adj triumphantly.adv
true.adj truth.n truly.adv truthful.adj
trust.v,n trustworthy.adj trusting.adj
tyrant.p tyranny.n tyrannical.adj
understand.v understanding.n understandable.adj
unique.adj uniqueness.n uniquely.adv
unite.v unity.n union.n
universe.n universal.adj universally.adv
urge.v,n urgent.adj urgency.n urgently.adv
use.v,n user.p useful.adj useless.adj
vague.adj vagueness.n vaguely.adv
vain.adj vanity.n vainly.adv
value.v,n valuable.adj valueless.adj
vary.v variety.n various.adj variation.n
victory.n victor.p victorious.adj victoriously.adv
vigorous.adj vigor.n vigorously.adv
violence.n violent.adj violently.adv
virtue.n virtuous.adj virtuously.adv
vision.n visible.adj visibly.adv visibility.n
vital.adj vitality.n vitally.adv
war.n warrior.p warlike.adj
warm.adj,v warmth.n warmly.adv
waste.v,n wasteful.adj wastefully.adv
watch.v,n watcher.p watchful.adj
weak.adj weakness.n weakly.adv weaken.v
weigh.v weight.n weighty.adj
wicked.adj wickedness.n wickedly.adv
wide.adj width.n widely.adv widen.v
wild.adj wilderness.n wildly.adv wildness.n
will.n willing.adj willingly.adv willingness.n
wisdom.n wise.adj wisely.adv
withdraw.v withdrawal.n withdrawn.adj
wonder.v,n wonderful.adj wonderfully.adv
work.v,n worker.p workable.adj
wretch.p wretched.adj wretchedly.adv wretchedness.n
write.v writer.p writing.n
young.adj youth.n youthful.adj
zeal.n zealous.adj zealously.adv
`;
