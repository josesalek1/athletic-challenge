export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type FoodGroup = 'vegetables' | 'fruit' | 'whole_grains' | 'legumes' | 'protein' | 'dairy_alternatives';

export type PlanIdea = {
  name: string;
  detail: string;
  meal_type: MealType;
  food_groups: FoodGroup[];
};

// Opciones iniciales generales: el usuario puede guardar o sustituir cada una en su plan.
export const PLAN_IDEAS: PlanIdea[] = [
  { meal_type: 'breakfast', name: 'Oats, skyr and berries', detail: '80 g oats + 250 g plain skyr or high-protein yogurt + berries + unsalted walnuts.', food_groups: ['dairy_alternatives', 'whole_grains', 'fruit'] },
  { meal_type: 'breakfast', name: 'Eggs, oats and fruit', detail: 'Three eggs with tomatoes + oats in milk + plain skyr and whole fruit. Season with herbs.', food_groups: ['protein', 'whole_grains', 'vegetables', 'fruit', 'dairy_alternatives'] },
  { meal_type: 'breakfast', name: 'Plain yogurt, banana and oats', detail: 'Plain high-protein yogurt + banana + oats + unsalted nuts; no sweetened granola.', food_groups: ['dairy_alternatives', 'fruit', 'whole_grains'] },
  { meal_type: 'breakfast', name: 'Tofu scramble and potatoes', detail: 'A generous portion of plain tofu with peppers and spinach + potatoes + whole fruit. Use garlic and paprika.', food_groups: ['protein', 'vegetables', 'fruit'] },
  { meal_type: 'breakfast', name: 'Skyr, pear and homemade muesli', detail: 'Plain skyr + oats + pear + unsalted seeds; check that muesli has no added sugar.', food_groups: ['dairy_alternatives', 'whole_grains', 'fruit'] },
  { meal_type: 'breakfast', name: 'Egg and avocado toast', detail: 'Three eggs + avocado + tomato on lower-sodium bread; add plain skyr if this is your main protein meal.', food_groups: ['protein', 'whole_grains', 'vegetables', 'dairy_alternatives'] },
  { meal_type: 'lunch', name: 'Chicken, rice and vegetables', detail: '180–220 g cooked chicken + rice + two handfuls of vegetables + olive oil; cook without stock cubes.', food_groups: ['protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'lunch', name: 'Turkey, potatoes and salad', detail: 'Fresh turkey rather than deli slices + potatoes + a large salad with lemon and olive oil.', food_groups: ['protein', 'vegetables'] },
  { meal_type: 'lunch', name: 'Lentil and quinoa bowl', detail: 'A generous serving of cooked lentils + quinoa + roast vegetables; add plain tofu or egg if needed.', food_groups: ['legumes', 'whole_grains', 'vegetables', 'protein'] },
  { meal_type: 'lunch', name: 'Chicken and whole-grain pasta', detail: 'Chicken + pasta + spinach and tomato + olive oil; use herbs instead of prepared sauce.', food_groups: ['protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'lunch', name: 'Bean and egg rice bowl', detail: 'Beans rinsed well + eggs + rice + peppers; add cumin, garlic and lemon.', food_groups: ['legumes', 'protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'lunch', name: 'Tofu, rice and broccoli', detail: 'Plain tofu + rice + broccoli and carrots; flavour with ginger and citrus instead of soy sauce.', food_groups: ['protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'snack', name: 'Banana and plain yogurt', detail: 'Before or after training: banana + about 250 g plain high-protein yogurt or skyr.', food_groups: ['fruit', 'dairy_alternatives'] },
  { meal_type: 'snack', name: 'Low-salt fresh cheese, fruit and oats', detail: 'Choose a low-sodium fresh cheese or plain skyr + fruit + oats or unsalted nuts.', food_groups: ['dairy_alternatives', 'fruit', 'whole_grains'] },
  { meal_type: 'snack', name: 'Egg and chicken sandwich', detail: 'Homemade sandwich with cooked chicken or egg; compare bread labels for sodium and skip deli meat.', food_groups: ['protein', 'whole_grains'] },
  { meal_type: 'snack', name: 'Apple, unsalted nuts and skyr', detail: 'Whole apple + unsalted nuts + plain skyr; use an unsweetened high-protein alternative if preferred.', food_groups: ['fruit', 'protein', 'dairy_alternatives'] },
  { meal_type: 'snack', name: 'Plain skyr with berries', detail: 'Plain skyr + berries + unsalted seeds; useful as an optional evening protein snack.', food_groups: ['dairy_alternatives', 'fruit'] },
  { meal_type: 'snack', name: 'Unsalted hummus, pita and carrots', detail: 'Make hummus without added salt; add carrots and pita. Pair with plain skyr after training if needed.', food_groups: ['legumes', 'whole_grains', 'vegetables', 'dairy_alternatives'] },
  { meal_type: 'dinner', name: 'Salmon, potatoes and greens', detail: 'Salmon + potatoes + a large green salad; season with lemon, herbs and olive oil.', food_groups: ['protein', 'vegetables'] },
  { meal_type: 'dinner', name: 'White fish, quinoa and vegetables', detail: 'Fresh white fish + quinoa + roast vegetables; avoid salted or smoked fish.', food_groups: ['protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'dinner', name: 'Tofu, rice and broccoli stir-fry', detail: 'Plain tofu + rice + broccoli; use ginger, garlic and lime instead of salty sauce.', food_groups: ['protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'dinner', name: 'Eggs, potatoes and salad', detail: 'Three eggs + potatoes + a large salad; add plain skyr with herbs as a sauce.', food_groups: ['protein', 'vegetables', 'dairy_alternatives'] },
  { meal_type: 'dinner', name: 'Chicken, quinoa and spinach', detail: 'Fresh chicken + quinoa + spinach and peppers with olive oil and paprika.', food_groups: ['protein', 'whole_grains', 'vegetables'] },
  { meal_type: 'dinner', name: 'Lentil and vegetable stew', detail: 'Lentils + plain tofu + vegetables + potatoes; cook with spices rather than stock cubes.', food_groups: ['legumes', 'protein', 'vegetables'] },
];
