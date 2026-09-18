'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { daysEndingAt, today } from '@/lib/format';
import { PLAN_IDEAS, type FoodGroup, type MealType, type PlanIdea } from '@/lib/nutrition-plan';

type Meal = {
  id: string;
  day: string;
  meal_type: MealType;
  name: string;
  food_groups: FoodGroup[];
  note: string | null;
  calories_kcal: number | null;
  created_at: string;
};
type PlanOption = PlanIdea & { id: string; created_at: string };

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
];
const FOOD_GROUPS: { key: FoodGroup; label: string }[] = [
  { key: 'vegetables', label: 'Vegetables' },
  { key: 'fruit', label: 'Fruit' },
  { key: 'whole_grains', label: 'Whole grains' },
  { key: 'legumes', label: 'Legumes' },
  { key: 'protein', label: 'Protein' },
  { key: 'dairy_alternatives', label: 'Dairy / alternatives' },
];
const EMPTY_QUICK_MEALS: Record<MealType, string> = { breakfast: '', lunch: '', snack: '', dinner: '' };
function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function NutritionJournal({ userId, initialDay }: { userId: string; initialDay: string }) {
  const [day, setDay] = useState(initialDay);
  const [lastDay, setLastDay] = useState(initialDay);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [weekMeals, setWeekMeals] = useState<Meal[]>([]);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planMessage, setPlanMessage] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [alternativeIndex, setAlternativeIndex] = useState<Record<MealType, number>>({ breakfast: 0, lunch: 0, snack: 0, dinner: 0 });
  const [planEditor, setPlanEditor] = useState<PlanIdea | null>(null);
  const [planEditingId, setPlanEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [note, setNote] = useState('');
  const [calories, setCalories] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [quickMeals, setQuickMeals] = useState<Record<MealType, string>>(EMPTY_QUICK_MEALS);
  const [quickMealStatus, setQuickMealStatus] = useState<Partial<Record<MealType, string>>>({});

  useEffect(() => {
    const localToday = today();
    setLastDay(localToday);
    if (localToday !== initialDay) setDay(localToday);
  }, [initialDay]);

  useEffect(() => {
    let active = true;
    async function loadPlan() {
      const { data, error } = await createClient().from('nutrition_plan_options')
        .select('id, meal_type, name, detail, food_groups, created_at')
        .order('created_at', { ascending: true });
      if (!active) return;
      setPlanLoading(false);
      if (error) {
        setPlanMessage('Your saved plan could not be loaded. Check that migration v19 has been applied.');
        return;
      }
      setPlanOptions((data ?? []) as PlanOption[]);
    }
    setPlanLoading(true);
    void loadPlan();
    return () => { active = false; };
  }, [planRevision]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const weekStart = daysEndingAt(day, 7)[0];

    async function load() {
      const { data, error } = await supabase.from('nutrition_meals')
        .select('id, day, meal_type, name, food_groups, note, calories_kcal, created_at')
        .gte('day', weekStart).lte('day', day)
        .order('created_at', { ascending: true });
      if (!active) return;
      setLoading(false);
      if (error) {
        setMeals([]);
        setWeekMeals([]);
        setMessage('Meals could not be loaded. Refresh and try again.');
        return;
      }
      const rows = (data ?? []) as Meal[];
      setWeekMeals(rows);
      setMeals(rows.filter((meal) => meal.day === day));
    }

    setLoading(true);
    void load();
    return () => { active = false; };
  }, [day, revision]);

  const loggedGroups = new Set(weekMeals.flatMap((meal) => meal.food_groups));
  const weekDays = daysEndingAt(day, 7);
  const knownCalories = meals.reduce((sum, meal) => sum + (meal.calories_kcal ?? 0), 0);
  const mealsWithCalories = meals.filter((meal) => meal.calories_kcal !== null).length;

  function resetForm() {
    setEditingId(null);
    setMealType('breakfast');
    setName('');
    setGroups([]);
    setNote('');
    setCalories('');
  }

  function selectDay(nextDay: string) {
    resetForm();
    setMessage('');
    setPlanMessage('');
    setQuickMeals(EMPTY_QUICK_MEALS);
    setQuickMealStatus({});
    setDay(nextDay);
  }

  function startEdit(meal: Meal) {
    setEditingId(meal.id);
    setMealType(meal.meal_type);
    setName(meal.name);
    setGroups(meal.food_groups);
    setNote(meal.note ?? '');
    setCalories(meal.calories_kcal?.toString() ?? '');
    setMessage('');
    document.getElementById('nutrition-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveMeal() {
    const cleanName = name.trim();
    const cleanNote = note.trim();
    const calorieValue = calories.trim() ? Number(calories) : null;
    if (!cleanName || cleanName.length > 120 || cleanNote.length > 280) {
      setMessage('Add a meal name of up to 120 characters and a note of up to 280 characters.');
      return;
    }
    if (calorieValue !== null && (!Number.isInteger(calorieValue) || calorieValue < 1 || calorieValue > 5000)) {
      setMessage('Calories must be a whole number between 1 and 5000.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage('');
    const supabase = createClient();
    const values = {
      meal_type: mealType,
      name: cleanName,
      food_groups: groups,
      note: cleanNote || null,
      calories_kcal: calorieValue,
    };
    const { error } = editingId
      ? await supabase.from('nutrition_meals').update(values).eq('id', editingId)
      : await supabase.from('nutrition_meals').insert({ ...values, user_id: userId, day });
    setBusy(false);
    if (error) {
      setMessage('The meal could not be saved. Check your connection and try again.');
      return;
    }
    resetForm();
    setMessage(editingId ? 'Meal updated.' : 'Meal added.');
    setRevision((value) => value + 1);
  }

  async function deleteMeal(meal: Meal) {
    if (!window.confirm(`Delete “${meal.name}”?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('nutrition_meals').delete().eq('id', meal.id);
    if (error) {
      setMessage('The meal could not be deleted. Try again.');
      return;
    }
    if (editingId === meal.id) resetForm();
    setMessage('Meal deleted.');
    setRevision((value) => value + 1);
  }

  function openPlanEditor(option?: PlanIdea, id?: string) {
    setPlanEditingId(id ?? null);
    setPlanEditor(option ?? { meal_type: 'breakfast', name: '', detail: '', food_groups: [] });
    setPlanMessage('');
    window.setTimeout(() => document.getElementById('nutrition-plan-editor')?.scrollIntoView({ behavior: 'smooth' }), 0);
  }

  async function savePlanOption() {
    if (!planEditor || planBusy) return;
    const name = planEditor.name.trim();
    const detail = planEditor.detail.trim();
    if (!name || name.length > 120 || detail.length > 280) {
      setPlanMessage('Add an option name of up to 120 characters and a detail of up to 280 characters.');
      return;
    }
    setPlanBusy(true);
    const values = { meal_type: planEditor.meal_type, name, detail, food_groups: planEditor.food_groups };
    const { error } = planEditingId
      ? await createClient().from('nutrition_plan_options').update(values).eq('id', planEditingId)
      : await createClient().from('nutrition_plan_options').insert({ ...values, user_id: userId });
    setPlanBusy(false);
    if (error) {
      setPlanMessage('The plan option could not be saved. Check your connection and try again.');
      return;
    }
    setPlanEditor(null);
    setPlanEditingId(null);
    setPlanMessage('Plan option saved.');
    setPlanRevision((value) => value + 1);
  }

  async function addSuggestedOption(option: PlanIdea) {
    if (planBusy) return;
    setPlanBusy(true);
    setPlanMessage('');
    const { error } = await createClient().from('nutrition_plan_options').insert({ ...option, user_id: userId });
    setPlanBusy(false);
    if (error) {
      setPlanMessage('The option could not be saved. Check your connection and try again.');
      return;
    }
    setPlanMessage(`${option.name} added to your plan.`);
    setPlanRevision((value) => value + 1);
  }

  async function deletePlanOption(option: PlanOption) {
    if (!window.confirm(`Remove “${option.name}” from your plan?`)) return;
    const { error } = await createClient().from('nutrition_plan_options').delete().eq('id', option.id);
    if (error) {
      setPlanMessage('The plan option could not be removed. Try again.');
      return;
    }
    if (planEditingId === option.id) { setPlanEditor(null); setPlanEditingId(null); }
    setPlanMessage('Plan option removed.');
    setPlanRevision((value) => value + 1);
  }

  async function logPlanOption(option: PlanIdea) {
    if (busy) return;
    setBusy(true);
    setPlanMessage('');
    const { error } = await createClient().from('nutrition_meals').insert({
      user_id: userId, day, meal_type: option.meal_type, name: option.name,
      food_groups: option.food_groups, note: null, calories_kcal: null,
    });
    setBusy(false);
    if (error) {
      setPlanMessage('The meal could not be logged. Check your connection and try again.');
      return;
    }
    setPlanMessage(`${option.name} logged for ${dayLabel(day)}.`);
    setRevision((value) => value + 1);
  }

  async function logQuickMeal(type: MealType) {
    const cleanName = quickMeals[type].trim();
    if (!cleanName || busy) return;
    if (cleanName.length > 120) {
      setQuickMealStatus((current) => ({ ...current, [type]: 'Keep the description under 120 characters.' }));
      return;
    }
    setBusy(true);
    setQuickMealStatus((current) => ({ ...current, [type]: '' }));
    const { error } = await createClient().from('nutrition_meals').insert({
      user_id: userId, day, meal_type: type, name: cleanName,
      food_groups: [], note: null, calories_kcal: null,
    });
    setBusy(false);
    if (error) {
      setQuickMealStatus((current) => ({ ...current, [type]: 'Could not log this meal. Check your connection and try again.' }));
      return;
    }
    setQuickMeals((current) => ({ ...current, [type]: '' }));
    setQuickMealStatus((current) => ({ ...current, [type]: 'Meal logged.' }));
    setRevision((value) => value + 1);
  }

  function optionsFor(type: MealType): (PlanIdea & { id?: string })[] {
    const saved = planOptions.filter((option) => option.meal_type === type);
    const savedNames = new Set(saved.map((option) => option.name.toLowerCase()));
    const starter = PLAN_IDEAS.filter((idea) => idea.meal_type === type && !savedNames.has(idea.name.toLowerCase()))
      .slice(0, Math.max(0, 2 - saved.length));
    return [...saved, ...starter];
  }

  function alternativeFor(type: MealType, displayed: PlanIdea[]) {
    const visibleNames = new Set(displayed.map((option) => option.name.toLowerCase()));
    const pool = PLAN_IDEAS.filter((idea) => idea.meal_type === type && !visibleNames.has(idea.name.toLowerCase()));
    const recentlyEaten = new Set(weekMeals.filter((meal) => meal.meal_type === type).map((meal) => meal.name.toLowerCase()));
    const fresh = pool.filter((idea) => !recentlyEaten.has(idea.name.toLowerCase()));
    const choices = fresh.length ? fresh : pool;
    const daySeed = Number(day.replaceAll('-', ''));
    return choices.length ? choices[(daySeed + alternativeIndex[type]) % choices.length] : null;
  }

  return (
    <main className="wrap nutrition-page">
      <p className="eyebrow">Plan and food journal</p>
      <h1 className="display">Nutrition</h1>
      <p className="muted nutrition-intro">Choose from your meal options, find an alternative, and record what you actually ate.</p>

      <div className="nutrition-day-picker">
        <button className="btn-ghost" type="button" aria-label="Previous day" disabled={busy} onClick={() => selectDay(shiftDay(day, -1))}>←</button>
        <label htmlFor="nutrition-day">Log for
          <input id="nutrition-day" type="date" max={lastDay} value={day} disabled={busy}
            onChange={(event) => { if (event.target.value) selectDay(event.target.value); }} />
        </label>
        <button className="btn-ghost" type="button" aria-label="Next day" disabled={busy || day >= lastDay}
          onClick={() => selectDay(shiftDay(day, 1))}>→</button>
      </div>
      <p className="nutrition-date-label">{dayLabel(day)}</p>

      <section className="nutrition-plan" aria-labelledby="nutrition-plan-heading">
        <div className="section-heading">
          <div><p className="eyebrow">Build muscle · limit fat gain</p><h2 id="nutrition-plan-heading">Your meal plan</h2></div>
          <button className="btn-ghost" type="button" onClick={() => openPlanEditor()}>Add option</button>
        </div>
        <p className="muted nutrition-plan-intro">Options follow your low-sodium, low-added-sugar starting plan. Use more rice, oats or potatoes around harder sessions. Your saved choices appear first.</p>
        {planLoading && <p className="muted">Loading your plan…</p>}
        {planMessage && <p className="settings-feedback" role="status">{planMessage}</p>}
        <div className="nutrition-plan-grid">
          {MEAL_TYPES.map((type) => {
            const saved = planOptions.filter((option) => option.meal_type === type.key);
            const displayed = optionsFor(type.key);
            const alternative = alternativeFor(type.key, displayed);
            return <section className="card nutrition-plan-slot" key={type.key} aria-label={`${type.label} options`}>
              <div className="between"><h3>{type.label}</h3><span className="privacy-pill">{saved.length ? 'Saved + ideas' : 'Starter ideas'}</span></div>
              <div className="nutrition-plan-options">
                {displayed.map((option) => <article key={option.id ?? option.name} className="nutrition-plan-option">
                  <h4>{option.name}</h4>
                  <p className="muted">{option.detail}</p>
                  <div className="nutrition-plan-actions">
                    <button type="button" disabled={busy} onClick={() => void logPlanOption(option)}>Log eaten</button>
                    {option.id
                      ? <><button type="button" onClick={() => openPlanEditor(option, option.id)}>Edit</button>
                          <button type="button" onClick={() => void deletePlanOption(option as PlanOption)}>Remove</button></>
                      : <button type="button" disabled={planBusy} onClick={() => void addSuggestedOption(option)}>Save to plan</button>}
                  </div>
                </article>)}
              </div>
              {alternative && <div className="nutrition-alternative">
                <p className="eyebrow">Suggested alternative</p>
                <h4>{alternative.name}</h4>
                <p className="muted">{alternative.detail}</p>
                <div className="nutrition-plan-actions">
                  <button type="button" onClick={() => setAlternativeIndex((current) => ({ ...current, [type.key]: current[type.key] + 1 }))}>Another alternative</button>
                  <button type="button" disabled={planBusy} onClick={() => void addSuggestedOption(alternative)}>Save to plan</button>
                  <button type="button" disabled={busy} onClick={() => void logPlanOption(alternative)}>Log eaten</button>
                </div>
              </div>}
              <form className="nutrition-quick-log" onSubmit={(event) => { event.preventDefault(); void logQuickMeal(type.key); }}>
                <label htmlFor={`quick-meal-${type.key}`}>Ate something else?</label>
                <textarea id={`quick-meal-${type.key}`} rows={2} maxLength={120} value={quickMeals[type.key]}
                  onChange={(event) => {
                    setQuickMeals((current) => ({ ...current, [type.key]: event.target.value }));
                    setQuickMealStatus((current) => ({ ...current, [type.key]: '' }));
                  }}
                  placeholder="Write what you ate, even at a restaurant" />
                <button className="btn-water" type="submit" disabled={busy || !quickMeals[type.key].trim()}>{busy ? 'Saving…' : 'Log this meal'}</button>
                {quickMealStatus[type.key] && <p className="nutrition-quick-status" role="status">{quickMealStatus[type.key]}</p>}
              </form>
            </section>;
          })}
        </div>
        <p className="metric-explainer nutrition-plan-source">These ideas adapt the plan you supplied. Check labels for sodium and added sugar; ingredients and portions determine actual nutrition values.</p>
      </section>

      <section className="card nutrition-targets" aria-labelledby="nutrition-targets-heading">
        <p className="eyebrow">Your starting point · based on 70 kg</p>
        <h2 id="nutrition-targets-heading">Build muscle, keep sodium and added sugar low</h2>
        <div className="nutrition-target-grid">
          <div><span>Energy</span><strong className="num">2,700–2,900 kcal</strong></div>
          <div><span>Protein</span><strong className="num">130–150 g</strong></div>
          <div><span>Carbs</span><strong className="num">280–380 g</strong></div>
          <div><span>Fat</span><strong className="num">65–85 g</strong></div>
          <div><span>Sodium</span><strong className="num">&lt;2,000 mg</strong></div>
          <div><span>Free sugars</span><strong className="num">ideally &lt;25 g</strong></div>
        </div>
        <p className="metric-explainer">These are the starting targets you supplied. Review your weekly weight trend after 14 days; your plan suggests adding 150–200 kcal/day if gain is below about 0.18–0.35 kg/week. Whole fruit is different from free sugars.</p>
        <details className="nutrition-plan-guidance">
          <summary>How to use this plan</summary>
          <ul>
            <li>Spread protein across 3–4 meals; your starting plan uses roughly 30–40 g per meal.</li>
            <li>Put more oats, rice, potatoes or fruit around swimming and strength sessions.</li>
            <li>Choose plain yogurt, unsalted nuts and fresh proteins. Compare bread and cheese labels for sodium.</li>
            <li>Flavour food with lemon, garlic, herbs and spices instead of stock cubes or salty sauces.</li>
            <li>Whole fruit fits the plan; sweetened drinks, juice and sweetened bars count toward free sugars.</li>
          </ul>
        </details>
        <details className="nutrition-plan-guidance">
          <summary>Supplement notes from your plan</summary>
          <ul>
            <li>Creatine monohydrate: your plan lists 3–5 g daily with a meal or drink. It can increase scale weight through water retention.</li>
            <li>Omega-3: optional when you eat little oily fish. Check the EPA + DHA amount and review medication interactions.</li>
            <li>Collagen with vitamin C: optional for tendon or joint goals; it does not replace a complete protein meal.</li>
            <li>Ashwagandha and oregano oil are outside your starting routine.</li>
          </ul>
          <p className="metric-explainer">Review supplements with a clinician or pharmacist if you have kidney or liver disease, take medication, or have surgery planned. <a href="https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-Consumer/" target="_blank" rel="noopener noreferrer">Supplement evidence</a> · <a href="https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/" target="_blank" rel="noopener noreferrer">Omega-3 interactions</a></p>
        </details>
      </section>

      {planEditor && <section className="nutrition-form-section" id="nutrition-plan-editor" aria-labelledby="nutrition-plan-editor-heading">
        <div className="section-heading"><div><p className="eyebrow">Your plan</p><h2 id="nutrition-plan-editor-heading">{planEditingId ? 'Edit option' : 'Save an option'}</h2></div></div>
        <form className="card" onSubmit={(event) => { event.preventDefault(); void savePlanOption(); }}>
          <label htmlFor="plan-meal-type">Meal</label>
          <select id="plan-meal-type" value={planEditor.meal_type} onChange={(event) => setPlanEditor({ ...planEditor, meal_type: event.target.value as MealType })}>
            {MEAL_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
          </select>
          <label htmlFor="plan-name">Option name</label>
          <input id="plan-name" value={planEditor.name} maxLength={120} required onChange={(event) => setPlanEditor({ ...planEditor, name: event.target.value })} placeholder="e.g. Chicken, rice and vegetables" />
          <label htmlFor="plan-detail">What goes with it? · optional</label>
          <textarea id="plan-detail" rows={2} maxLength={280} value={planEditor.detail} onChange={(event) => setPlanEditor({ ...planEditor, detail: event.target.value })} placeholder="Portion or swap notes from your plan" />
          <p className="nutrition-field-label">Food groups · optional</p>
          <div className="nutrition-group-picker">
            {FOOD_GROUPS.map((group) => <button key={group.key} type="button" aria-pressed={planEditor.food_groups.includes(group.key)}
              onClick={() => setPlanEditor({ ...planEditor, food_groups: planEditor.food_groups.includes(group.key)
                ? planEditor.food_groups.filter((key) => key !== group.key) : [...planEditor.food_groups, group.key] })}>{group.label}</button>)}
          </div>
          <div className="nutrition-form-actions">
            <button className="btn-ghost" type="button" onClick={() => { setPlanEditor(null); setPlanEditingId(null); }}>Cancel</button>
            <button className="btn-water" type="submit" disabled={planBusy || !planEditor.name.trim()}>{planBusy ? 'Saving…' : 'Save to plan'}</button>
          </div>
          {planMessage && <p className="settings-feedback">{planMessage}</p>}
        </form>
      </section>}

      <div className="section-heading nutrition-journal-heading"><div><p className="eyebrow">What you ate</p><h2>Food journal</h2></div></div>

      <section className="nutrition-overview" aria-label="Weekly food variety">
        <div className="card">
          <p className="eyebrow">Last 7 days</p>
          <strong className="nutrition-big-number num">{loggedGroups.size}<small> / {FOOD_GROUPS.length}</small></strong>
          <p className="muted">Food groups you logged</p>
          <div className="nutrition-group-list">
            {FOOD_GROUPS.map((group) => (
              <span key={group.key} data-logged={loggedGroups.has(group.key)}>{group.label}</span>
            ))}
          </div>
          <p className="metric-explainer">This reflects your entries, not a nutrition score.</p>
        </div>
        <div className="card">
          <p className="eyebrow">Meal rhythm</p>
          <div className="nutrition-week-days">
            {weekDays.map((date) => {
              const count = weekMeals.filter((meal) => meal.day === date).length;
              return <div key={date} title={`${dayLabel(date)}: ${count} meals`}>
                <strong className="num">{count || '·'}</strong>
                <span>{new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              </div>;
            })}
          </div>
          <p className="metric-explainer">Number of meals logged each day. Blank days stay neutral.</p>
        </div>
      </section>

      <section aria-labelledby="nutrition-meals-heading">
        <div className="section-heading">
          <div><p className="eyebrow">{day === lastDay ? 'Today' : 'Selected day'}</p><h2 id="nutrition-meals-heading">Meals</h2></div>
          <span className="privacy-pill">Only you</span>
        </div>
        {message && <p className="settings-feedback" role="status">{message}</p>}
        {mealsWithCalories > 0 && <p className="nutrition-calorie-summary">Known calories: <strong className="num">{knownCalories} kcal</strong>{mealsWithCalories < meals.length ? ` · ${meals.length - mealsWithCalories} meal(s) without a value` : ''}</p>}
        {loading ? <p className="muted">Loading meals…</p> : meals.length ? (
          <div className="nutrition-meal-list">
            {MEAL_TYPES.map((type) => meals.filter((meal) => meal.meal_type === type.key).map((meal) => (
              <article className="card nutrition-meal" key={meal.id}>
                <p className="eyebrow">{type.label}</p>
                <h3>{meal.name}</h3>
                {meal.note && <p className="muted">{meal.note}</p>}
                {meal.calories_kcal !== null && <p className="nutrition-calorie-label num">{meal.calories_kcal} kcal · entered by you</p>}
                {meal.food_groups.length > 0 && <div className="nutrition-group-list">
                  {meal.food_groups.map((group) => <span key={group} data-logged="true">{FOOD_GROUPS.find((item) => item.key === group)?.label ?? group}</span>)}
                </div>}
                <div className="nutrition-meal-actions">
                  <button type="button" onClick={() => startEdit(meal)}>Edit</button>
                  <button type="button" onClick={() => void deleteMeal(meal)}>Delete</button>
                </div>
              </article>
            )))}
          </div>
        ) : <div className="card"><p className="muted">No meals logged for this day yet.</p></div>}
      </section>

      <section className="nutrition-form-section" id="nutrition-form" aria-labelledby="nutrition-form-heading">
        <div className="section-heading"><div><p className="eyebrow">Your journal</p><h2 id="nutrition-form-heading">{editingId ? 'Edit meal' : 'Add a meal'}</h2></div></div>
        <form className="card" onSubmit={(event) => { event.preventDefault(); void saveMeal(); }}>
          <label htmlFor="meal-type">Meal</label>
          <select id="meal-type" value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
            {MEAL_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
          </select>
          <label htmlFor="meal-name">What did you eat?</label>
          <input id="meal-name" value={name} maxLength={120} required
            onChange={(event) => setName(event.target.value)} placeholder="e.g. Lentil bowl" />
          <p className="nutrition-field-label">Food groups · optional</p>
          <div className="nutrition-group-picker">
            {FOOD_GROUPS.map((group) => <button key={group.key} type="button" aria-pressed={groups.includes(group.key)}
              onClick={() => setGroups((current) => current.includes(group.key)
                ? current.filter((key) => key !== group.key) : [...current, group.key])}>{group.label}</button>)}
          </div>
          <label htmlFor="meal-note">Note · optional</label>
          <textarea id="meal-note" rows={2} maxLength={280} value={note}
            onChange={(event) => setNote(event.target.value)} placeholder="Anything you want to remember" />
          <label htmlFor="meal-calories">Calories in kcal · optional</label>
          <input id="meal-calories" type="number" inputMode="numeric" min="1" max="5000" value={calories}
            onChange={(event) => setCalories(event.target.value)} placeholder="Only if you know the value" />
          <div className="nutrition-form-actions">
            {editingId && <button className="btn-ghost" type="button" onClick={resetForm}>Cancel</button>}
            <button className="btn-water" type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add meal'}</button>
          </div>
          {message && <p className="settings-feedback">{message}</p>}
        </form>
      </section>
    </main>
  );
}
