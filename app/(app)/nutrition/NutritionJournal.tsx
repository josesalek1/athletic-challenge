'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { daysEndingAt, today } from '@/lib/format';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type FoodGroup = 'vegetables' | 'fruit' | 'whole_grains' | 'legumes' | 'protein' | 'dairy_alternatives';
type Meal = {
  id: string;
  day: string;
  meal_type: MealType;
  name: string;
  food_groups: FoodGroup[];
  note: string | null;
  created_at: string;
};

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];
const FOOD_GROUPS: { key: FoodGroup; label: string }[] = [
  { key: 'vegetables', label: 'Vegetables' },
  { key: 'fruit', label: 'Fruit' },
  { key: 'whole_grains', label: 'Whole grains' },
  { key: 'legumes', label: 'Legumes' },
  { key: 'protein', label: 'Protein' },
  { key: 'dairy_alternatives', label: 'Dairy / alternatives' },
];
const IDEAS: { name: string; mealType: MealType; groups: FoodGroup[] }[] = [
  { name: 'Oats with berries and yogurt', mealType: 'breakfast', groups: ['whole_grains', 'fruit', 'dairy_alternatives'] },
  { name: 'Eggs, toast and tomatoes', mealType: 'breakfast', groups: ['protein', 'whole_grains', 'vegetables'] },
  { name: 'Lentil and vegetable bowl', mealType: 'lunch', groups: ['legumes', 'vegetables'] },
  { name: 'Hummus, pita and cucumber', mealType: 'lunch', groups: ['legumes', 'whole_grains', 'vegetables'] },
  { name: 'Rice, tofu and greens', mealType: 'dinner', groups: ['whole_grains', 'protein', 'vegetables'] },
  { name: 'Fish, potatoes and broccoli', mealType: 'dinner', groups: ['protein', 'vegetables'] },
  { name: 'Apple with nuts', mealType: 'snack', groups: ['fruit', 'protein'] },
  { name: 'Yogurt with fruit', mealType: 'snack', groups: ['fruit', 'dairy_alternatives'] },
];

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
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ideaIndex, setIdeaIndex] = useState(Number(initialDay.slice(-2)));

  useEffect(() => {
    const localToday = today();
    setLastDay(localToday);
    if (localToday !== initialDay) setDay(localToday);
  }, [initialDay]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const weekStart = daysEndingAt(day, 7)[0];

    async function load() {
      const { data, error } = await supabase.from('nutrition_meals')
        .select('id, day, meal_type, name, food_groups, note, created_at')
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
  const missingGroups = FOOD_GROUPS.filter((group) => !loggedGroups.has(group.key));
  const matchingIdeas = IDEAS.filter((idea) => idea.groups.some((group) => !loggedGroups.has(group)));
  const ideaPool = matchingIdeas.length ? matchingIdeas : IDEAS;
  const idea = ideaPool[ideaIndex % ideaPool.length];
  const weekDays = daysEndingAt(day, 7);

  function resetForm() {
    setEditingId(null);
    setMealType('breakfast');
    setName('');
    setGroups([]);
    setNote('');
  }

  function selectDay(nextDay: string) {
    resetForm();
    setMessage('');
    setIdeaIndex(Number(nextDay.slice(-2)));
    setDay(nextDay);
  }

  function startEdit(meal: Meal) {
    setEditingId(meal.id);
    setMealType(meal.meal_type);
    setName(meal.name);
    setGroups(meal.food_groups);
    setNote(meal.note ?? '');
    setMessage('');
    document.getElementById('nutrition-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveMeal() {
    const cleanName = name.trim();
    const cleanNote = note.trim();
    if (!cleanName || cleanName.length > 120 || cleanNote.length > 280) {
      setMessage('Add a meal name of up to 120 characters and a note of up to 280 characters.');
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

  return (
    <main className="wrap nutrition-page">
      <p className="eyebrow">Personal food journal</p>
      <h1 className="display">Nutrition</h1>
      <p className="muted nutrition-intro">Keep a simple record of your meals and notice variety over time.</p>

      <div className="nutrition-day-picker">
        <button className="btn-ghost" type="button" aria-label="Previous day" onClick={() => selectDay(shiftDay(day, -1))}>←</button>
        <label htmlFor="nutrition-day">Day
          <input id="nutrition-day" type="date" max={lastDay} value={day}
            onChange={(event) => { if (event.target.value) selectDay(event.target.value); }} />
        </label>
        <button className="btn-ghost" type="button" aria-label="Next day" disabled={day >= lastDay}
          onClick={() => selectDay(shiftDay(day, 1))}>→</button>
      </div>
      <p className="nutrition-date-label">{dayLabel(day)}</p>

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

      <section className="nutrition-idea card" aria-label="Meal idea">
        <div className="between"><p className="eyebrow">Something different</p><span className="privacy-pill">Optional</span></div>
        <h2>{idea.name}</h2>
        <p className="muted">{missingGroups.length
          ? `Includes ${idea.groups.filter((group) => !loggedGroups.has(group)).map((group) => FOOD_GROUPS.find((item) => item.key === group)?.label.toLowerCase()).join(' and ')} you have not logged this week.`
          : 'Another meal idea for your journal.'}</p>
        <div className="nutrition-idea-actions">
          <button className="btn-ghost" type="button" onClick={() => setIdeaIndex((value) => value + 1)}>Another idea</button>
          <button className="btn-water" type="button" onClick={() => {
            setEditingId(null);
            setMealType(idea.mealType);
            setName(idea.name);
            setGroups(idea.groups);
            setNote('');
            document.getElementById('nutrition-form')?.scrollIntoView({ behavior: 'smooth' });
          }}>Use this idea</button>
        </div>
      </section>

      <section aria-labelledby="nutrition-meals-heading">
        <div className="section-heading">
          <div><p className="eyebrow">{day === lastDay ? 'Today' : 'Selected day'}</p><h2 id="nutrition-meals-heading">Meals</h2></div>
          <span className="privacy-pill">Only you</span>
        </div>
        {loading ? <p className="muted">Loading meals…</p> : meals.length ? (
          <div className="nutrition-meal-list">
            {MEAL_TYPES.map((type) => meals.filter((meal) => meal.meal_type === type.key).map((meal) => (
              <article className="card nutrition-meal" key={meal.id}>
                <p className="eyebrow">{type.label}</p>
                <h3>{meal.name}</h3>
                {meal.note && <p className="muted">{meal.note}</p>}
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
          <div className="nutrition-form-actions">
            {editingId && <button className="btn-ghost" type="button" onClick={resetForm}>Cancel</button>}
            <button className="btn-water" type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add meal'}</button>
          </div>
          {message && <p className="settings-feedback" role="status">{message}</p>}
        </form>
      </section>
    </main>
  );
}
