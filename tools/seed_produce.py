#!/usr/bin/env python3
"""seed_produce.py — emit SQL adding supermarket produce to the food library.

    python3 tools/seed_produce.py > supabase/food_produce.sql

The produce aisle of a Safeway or a Trader Joe's: fruit, vegetables, fresh
herbs, mushrooms, fresh legumes, and the bagged/prepped produce those shops
actually stock. Values are per the stated serving, not per 100 g, because that
is how the app logs them.

Rows are keyed `prod-*` and inserted with ON CONFLICT DO NOTHING, so this is
safe to re-run and cannot overwrite a hand-corrected entry. The library already
carries some produce under `ind-*` and bare ids; names here are checked against
those before insert, so the same food does not appear twice in search.
"""

import sys

# id, name, icon, serving label, grams, kcal, protein, carbs, fat, fibre,
# sugar, sodium(mg), vit A(mcg), vit C(mg), calcium(mg), iron(mg),
# potassium(mg), folate(mcg)
FRUIT = [
 ('gala-apple','Gala Apple','apple','1 medium',182,95,0.5,25.1,0.3,4.4,18.9,2,5,8.4,11,0.2,195,5),
 ('granny-smith','Granny Smith Apple','apple','1 medium',182,95,0.5,25.1,0.3,4.4,16.9,2,5,8.4,11,0.2,195,5),
 ('honeycrisp','Honeycrisp Apple','apple','1 large',220,116,0.6,30.8,0.4,5.3,23.1,2,6,10,13,0.2,236,6),
 ('fuji-apple','Fuji Apple','apple','1 medium',182,95,0.5,25.1,0.3,4.4,19.1,2,5,8.4,11,0.2,195,5),
 ('bartlett-pear','Bartlett Pear','apple','1 medium',178,101,0.6,27.1,0.2,5.5,17.976,2,2,7.5,16,0.3,206,12),
 ('bosc-pear','Bosc Pear','apple','1 medium',170,96,0.6,25.7,0.2,5.2,17,2,1,7,15,0.3,196,12),
 ('navel-orange','Navel Orange','orange','1 medium',140,73,1.3,16.5,0.2,3.4,12.2,1,15,82.7,60,0.1,232,39),
 ('cara-cara','Cara Cara Orange','orange','1 medium',140,73,1.3,16.5,0.2,3.4,12.2,1,25,80,60,0.1,232,39),
 ('blood-orange','Blood Orange','orange','1 medium',140,70,1.2,16,0.2,3.1,12,1,20,75,58,0.1,230,38),
 ('mandarin','Mandarin / Cutie','orange','1 medium',88,47,0.7,11.7,0.3,1.6,9.3,2,30,23.5,33,0.1,146,14),
 ('lemon','Lemon','orange','1 medium',84,17,0.6,5.4,0.2,1.6,1.5,2,1,44.5,22,0.5,116,9),
 ('lime','Lime','orange','1 medium',67,20,0.5,7.1,0.1,1.9,1.1,1,1,19.5,22,0.4,68,5),
 ('grapefruit','Grapefruit','orange','1/2 medium',123,52,1,13.1,0.2,2,8.5,0,58,38.4,27,0.1,166,16),
 ('banana','Banana','banana','1 medium',118,105,1.3,27,0.4,3.1,14.4,1,4,10.3,6,0.3,422,24),
 ('plantain','Plantain','banana','1 medium',179,218,2.3,57.1,0.7,4.1,27,7,50,32.9,5,1.1,893,40),
 ('strawberries','Strawberries','berry','1 cup halves',152,49,1,11.7,0.5,3,7.4,2,1,89.4,24,0.6,233,36),
 ('blueberries','Blueberries','berry','1 cup',148,84,1.1,21.4,0.5,3.6,14.7,1,4,14.4,9,0.4,114,9),
 ('raspberries','Raspberries','berry','1 cup',123,64,1.5,14.7,0.8,8,5.4,1,2,32.2,31,0.8,186,26),
 ('blackberries','Blackberries','berry','1 cup',144,62,2,13.8,0.7,7.6,7,1,16,30.2,42,0.9,233,36),
 ('grapes-red','Red Grapes','berry','1 cup',151,104,1.1,27.3,0.2,1.4,23.4,3,5,16.3,15,0.5,288,3),
 ('grapes-green','Green Grapes','berry','1 cup',151,104,1.1,27.3,0.2,1.4,23.4,3,5,16.3,15,0.5,288,3),
 ('cherries','Cherries','berry','1 cup',154,97,1.6,24.7,0.3,3.2,19.7,0,3,10.8,18,0.5,342,6),
 ('peach','Peach','apple','1 medium',150,58,1.4,14.3,0.4,2.3,12.6,0,24,9.9,9,0.4,285,6),
 ('nectarine','Nectarine','apple','1 medium',142,62,1.5,15,0.4,2.4,11.2,0,24,7.7,9,0.4,285,7),
 ('plum','Plum','apple','1 medium',66,30,0.5,7.5,0.2,0.9,6.6,0,11,6.3,4,0.1,104,3),
 ('apricot','Apricot','apple','2 medium',70,34,1,7.9,0.3,1.4,6.5,1,67,7,9,0.3,181,6),
 ('mango','Mango','fork.knife','1 cup diced',165,99,1.4,24.7,0.6,2.6,22.5,2,89,60.1,18,0.3,277,71),
 ('pineapple','Pineapple','fork.knife','1 cup chunks',165,82,0.9,21.6,0.2,2.3,16.3,2,3,78.9,21,0.5,180,30),
 ('papaya','Papaya','fork.knife','1 cup cubes',145,62,0.7,15.7,0.4,2.5,11.3,12,68,88.3,29,0.4,264,53),
 ('kiwi','Kiwifruit','fork.knife','2 medium',138,84,1.6,20.1,0.7,4.1,12.5,4,6,127.7,47,0.4,430,35),
 ('watermelon','Watermelon','fork.knife','1 cup diced',152,46,0.9,11.5,0.2,0.6,9.4,2,43,12.3,11,0.4,170,5),
 ('cantaloupe','Cantaloupe','fork.knife','1 cup cubes',160,54,1.3,13,0.3,1.4,12.5,25,270,58.7,14,0.3,427,34),
 ('honeydew','Honeydew Melon','fork.knife','1 cup cubes',170,61,0.9,15.5,0.2,1.4,13.8,31,5,29.8,10,0.3,404,32),
 ('avocado','Avocado','avocado','1/2 medium',100,160,2,8.5,14.7,6.7,0.7,7,7,10,12,0.6,485,81),
 ('pomegranate','Pomegranate Arils','berry','1/2 cup',87,72,1.5,16.3,1,3.5,11.9,3,0,9,10,0.3,205,33),
 ('figs-fresh','Fresh Figs','fork.knife','2 medium',100,74,0.8,19.2,0.3,2.9,16.3,1,7,2,35,0.4,232,6),
 ('dates-medjool','Medjool Dates','fork.knife','2 dates',48,133,0.8,36,0.1,3.2,32,1,0,0,32,0.4,325,7),
 ('persimmon','Persimmon','fork.knife','1 medium',168,118,1,31.2,0.3,6,21,2,136,12.6,13,0.4,270,13),
 ('coconut-fresh','Fresh Coconut Meat','fork.knife','1 cup shredded',80,283,2.7,12.2,26.8,7.2,5,16,0,2.6,11,1.9,285,21),
 ('starfruit','Starfruit','fork.knife','1 medium',91,28,0.9,6.1,0.3,2.5,3.6,2,3,31.3,3,0.1,121,11),
 ('dragonfruit','Dragon Fruit','fork.knife','1 cup',227,136,2.9,29,0.4,7,18,0,0,9,20,0.7,450,10),
 ('guava','Guava','fork.knife','1 medium',55,37,1.4,7.9,0.5,3,5,1,17,125.6,10,0.1,229,27),
 ('lychee','Lychee','fork.knife','1 cup',190,125,1.6,31.4,0.8,2.5,29,2,0,135.8,10,0.6,325,27),
]

VEG = [
 ('broccoli','Broccoli','broccoli','1 cup chopped',91,31,2.6,6,0.3,2.4,1.5,30,7,81.2,43,0.7,288,57),
 ('broccolini','Broccolini','broccoli','1 cup',88,35,3,6,0.4,2.6,1.6,30,8,78,45,0.8,290,55),
 ('cauliflower','Cauliflower','broccoli','1 cup florets',107,27,2.1,5.3,0.3,2.1,2,32,1,51.6,24,0.4,320,61),
 ('brussels','Brussels Sprouts','broccoli','1 cup',88,38,3,7.9,0.3,3.3,1.9,22,33,74.8,37,1.2,342,54),
 ('cabbage-green','Green Cabbage','veg','1 cup shredded',89,22,1.1,5.2,0.1,2.2,2.8,16,5,32.6,36,0.4,151,38),
 ('cabbage-red','Red Cabbage','veg','1 cup shredded',89,28,1.3,6.6,0.1,1.9,3.5,24,50,50.7,40,0.7,216,16),
 ('napa','Napa Cabbage','veg','1 cup shredded',76,9,0.9,1.7,0.1,0.8,0.9,7,12,20.5,59,0.2,138,60),
 ('bok-choy','Bok Choy','leaf','1 cup shredded',70,9,1,1.5,0.1,0.7,0.8,46,156,31.5,74,0.6,176,46),
 ('kale','Kale','leaf','1 cup chopped',21,7,0.6,0.9,0.3,0.9,0.2,11,50,19.2,53,0.3,74,13),
 ('spinach','Spinach','leaf','1 cup raw',30,7,0.9,1.1,0.1,0.7,0.1,24,141,8.4,30,0.8,167,58),
 ('arugula','Arugula','salad','1 cup',20,5,0.5,0.7,0.1,0.3,0.4,5,24,3,32,0.3,74,19),
 ('romaine','Romaine Lettuce','salad','1 cup shredded',47,8,0.6,1.5,0.1,1,0.6,4,205,1.9,16,0.5,116,64),
 ('iceberg','Iceberg Lettuce','salad','1 cup shredded',72,10,0.6,2.1,0.1,0.9,1.4,7,18,2,13,0.3,102,21),
 ('butter-lettuce','Butter Lettuce','salad','1 cup',55,7,0.7,1.2,0.1,0.6,0.5,3,90,2,19,0.7,132,40),
 ('spring-mix','Spring Mix','salad','2 cups',85,20,1.8,3.2,0.3,1.8,1,25,180,15,45,1.1,240,80),
 ('swiss-chard','Swiss Chard','leaf','1 cup chopped',36,7,0.6,1.4,0.1,0.6,0.4,77,110,10.8,18,0.6,136,5),
 ('collards','Collard Greens','leaf','1 cup chopped',36,12,1.1,2,0.2,1.4,0.2,6,120,12.7,84,0.1,61,60),
 ('mustard-greens','Mustard Greens','leaf','1 cup chopped',56,15,1.6,2.6,0.2,1.8,0.7,14,84,39.2,58,0.8,198,105),
 ('watercress','Watercress','leaf','1 cup',34,4,0.8,0.4,0.1,0.2,0.1,14,54,14.6,41,0.1,112,3),
 ('carrot','Carrots','carrot','1 medium',61,25,0.6,5.8,0.1,1.7,2.9,42,509,3.6,20,0.2,195,12),
 ('baby-carrots','Baby Carrots','carrot','1 cup',128,50,0.9,11.7,0.2,4,6.3,101,919,4.6,42,1,404,29),
 ('parsnip','Parsnip','carrot','1 cup sliced',133,100,1.6,24,0.4,6.5,6.4,13,0,22.5,48,0.8,499,89),
 ('beet','Beets','veg','1 cup',136,58,2.2,13,0.2,3.8,9.2,106,2,6.7,22,1.1,442,148),
 ('turnip','Turnip','veg','1 cup cubed',130,36,1.2,8.4,0.1,2.3,4.9,87,0,27.3,39,0.4,248,19),
 ('radish','Radishes','veg','1 cup sliced',116,19,0.8,3.9,0.1,1.9,2.2,45,0,17.2,29,0.4,270,29),
 ('daikon','Daikon Radish','veg','1 cup sliced',116,21,0.7,4.8,0.1,1.9,2.8,25,0,25.6,32,0.5,264,33),
 ('potato-russet','Russet Potato','veg','1 medium',173,168,4.6,37.1,0.2,2.4,1.4,14,0,14.4,31,1.9,952,48),
 ('potato-yukon','Yukon Gold Potato','veg','1 medium',150,110,2.9,25.5,0.1,2.1,1.2,10,0,29.6,18,0.9,750,27),
 ('potato-red','Red Potato','veg','1 medium',173,154,4.1,34,0.3,3.1,2.4,21,0,22.1,19,1.4,943,44),
 ('sweet-potato','Sweet Potato','veg','1 medium',130,112,2,26.2,0.1,3.9,5.4,72,1096,3.2,39,0.8,438,14),
 ('yam','Yam','veg','1 cup cubed',150,177,2.3,41.8,0.3,6.2,0.8,14,7,25.8,26,0.8,816,35),
 ('onion-yellow','Yellow Onion','veg','1 medium',110,44,1.2,10.3,0.1,1.9,4.7,4,0,8.1,25,0.2,161,21),
 ('onion-red','Red Onion','veg','1 medium',110,44,1.2,10.3,0.1,1.9,4.7,4,0,8.1,25,0.2,161,21),
 ('shallot','Shallots','veg','2 tbsp chopped',20,14,0.5,3.4,0,0.6,1.6,2,0,1.6,7,0.2,67,7),
 ('scallion','Green Onions / Scallions','leaf','1/4 cup chopped',25,8,0.5,1.8,0,0.7,0.6,4,25,4.7,18,0.4,69,16),
 ('leek','Leeks','leaf','1 cup',89,54,1.3,12.6,0.3,1.6,3.5,18,74,10.7,53,1.9,160,57),
 ('garlic','Garlic','veg','3 cloves',9,13,0.6,3,0,0.2,0.1,2,0,2.8,16,0.2,36,0),
 ('ginger','Fresh Ginger','veg','1 tbsp grated',6,5,0.1,1.1,0,0.1,0.1,1,0,0.3,1,0,25,0),
 ('turmeric-fresh','Fresh Turmeric Root','veg','1 tbsp grated',7,8,0.2,1.4,0.1,0.5,0.2,1,0,1.7,1,0.4,181,2),
 ('tomato','Tomato','tomato','1 medium',123,22,1.1,4.8,0.2,1.5,3.2,6,51,16.9,12,0.3,292,18),
 ('roma-tomato','Roma Tomato','tomato','1 medium',62,11,0.5,2.4,0.1,0.7,1.6,3,25,8.5,6,0.2,147,9),
 ('cherry-tomato','Cherry Tomatoes','tomato','1 cup',149,27,1.3,5.8,0.3,1.8,3.9,7,62,20.4,15,0.4,353,22),
 ('heirloom-tomato','Heirloom Tomato','tomato','1 medium',150,27,1.3,5.9,0.3,1.8,3.9,7,62,21,15,0.4,356,22),
 ('bell-red','Red Bell Pepper','pepper','1 medium',119,37,1.4,7.2,0.4,2.5,5,4,187,152,8,0.5,251,54),
 ('bell-green','Green Bell Pepper','pepper','1 medium',119,24,1,5.5,0.2,2,2.9,4,22,95.7,12,0.4,208,12),
 ('bell-yellow','Yellow Bell Pepper','pepper','1 medium',119,37,1.4,7.2,0.4,2.5,5,4,120,218,13,0.5,255,32),
 ('jalapeno','Jalapeño','pepper','1 pepper',14,4,0.1,0.8,0.1,0.4,0.5,0,7,16.7,2,0.1,26,4),
 ('serrano','Serrano Pepper','pepper','1 pepper',6,2,0.1,0.4,0,0.2,0.2,0,3,2.3,1,0,18,1),
 ('poblano','Poblano Pepper','pepper','1 pepper',45,9,0.4,2,0.1,0.8,1,2,15,42,5,0.2,80,10),
 ('habanero','Habanero Pepper','pepper','1 pepper',9,4,0.2,0.8,0.1,0.1,0.5,0,5,20,1,0.1,29,2),
 ('anaheim','Anaheim Pepper','pepper','1 pepper',60,15,0.6,3.3,0.1,1,2,4,30,65,8,0.3,120,15),
 ('cucumber','Cucumber','veg','1 cup sliced',119,16,0.8,3.8,0.1,0.6,1.7,2,5,3.3,19,0.3,176,8),
 ('persian-cucumber','Persian Cucumbers','veg','2 small',100,15,0.7,3.6,0.1,0.5,1.7,2,5,2.8,16,0.3,147,7),
 ('zucchini','Zucchini','veg','1 medium',196,33,2.4,6.1,0.6,2,4.9,16,39,34.1,31,0.7,512,47),
 ('yellow-squash','Yellow Summer Squash','veg','1 cup sliced',113,19,1.4,4,0.2,1.3,2.5,2,10,19.3,17,0.4,192,33),
 ('butternut','Butternut Squash','veg','1 cup cubed',140,63,1.4,16.4,0.1,2.8,3.1,6,745,29.4,67,0.8,493,38),
 ('acorn-squash','Acorn Squash','veg','1 cup cubed',140,56,1.1,14.6,0.1,2.1,0,4,25,15.7,46,0.9,486,24),
 ('spaghetti-squash','Spaghetti Squash','veg','1 cup',101,31,0.6,7,0.6,1.5,2.8,17,5,2.1,23,0.3,109,12),
 ('pumpkin','Pumpkin','veg','1 cup cubed',116,30,1.2,7.5,0.1,0.6,3.2,1,494,10.4,24,0.9,394,19),
 ('eggplant','Eggplant','veg','1 cup cubed',82,20,0.8,4.8,0.2,2.7,2.9,2,1,1.8,7,0.2,188,18),
 ('asparagus','Asparagus','leaf','1 cup',134,27,3,5.2,0.2,2.8,2.5,3,50,7.5,32,2.9,271,70),
 ('green-beans','Green Beans','leaf','1 cup',100,31,1.8,7,0.1,2.7,3.3,6,35,12.2,37,1,211,33),
 ('snap-peas','Sugar Snap Peas','leaf','1 cup',63,26,1.7,4.7,0.1,1.6,2.5,3,34,37.8,26,1.3,124,26),
 ('snow-peas','Snow Peas','leaf','1 cup',63,26,1.7,4.7,0.1,1.6,2.5,3,34,37.8,26,1.3,124,26),
 ('peas-english','English Peas','leaf','1 cup',145,117,7.9,21,0.6,7.4,8.2,7,55,58,36,2.1,354,94),
 ('corn','Sweet Corn','grain','1 ear',90,77,2.9,17.1,1.1,2.4,5.9,13,9,5.5,2,0.5,243,42),
 ('celery','Celery','leaf','2 stalks',80,11,0.5,2.4,0.1,1.3,1,64,18,2.5,32,0.2,208,29),
 ('fennel','Fennel Bulb','leaf','1 cup sliced',87,27,1.1,6.3,0.2,2.7,3.4,45,3,10.4,43,0.6,360,23),
 ('artichoke','Artichoke','leaf','1 medium',128,60,4.2,13.5,0.2,6.9,1.3,120,1,11.7,56,1.6,474,87),
 ('okra','Okra','leaf','1 cup',100,33,1.9,7.5,0.2,3.2,1.5,7,36,23,82,0.6,299,60),
 ('mushroom-white','White Button Mushrooms','veg','1 cup sliced',70,15,2.2,2.3,0.2,0.7,1.2,4,0,1.5,2,0.4,223,11),
 ('mushroom-cremini','Cremini Mushrooms','veg','1 cup sliced',72,19,2.2,3.1,0.1,0.4,1.2,4,0,0,13,0.3,318,17),
 ('portobello','Portobello Mushrooms','veg','1 cap',84,22,2.1,3.9,0.3,1.1,2.5,8,0,0,3,0.3,306,21),
 ('shiitake','Shiitake Mushrooms','veg','1 cup',87,34,2.2,6.8,0.5,2.1,2.4,8,0,0,2,0.4,264,13),
 ('oyster-mushroom','Oyster Mushrooms','veg','1 cup',86,37,2.9,5.6,0.4,2,0.9,15,0,0,3,1.1,364,33),
 ('sprouts-alfalfa','Alfalfa Sprouts','leaf','1 cup',33,8,1.3,0.7,0.2,0.6,0.1,2,3,2.7,11,0.3,26,12),
 ('bean-sprouts','Mung Bean Sprouts','leaf','1 cup',104,31,3.2,6.2,0.2,1.9,4.3,6,1,13.7,14,0.9,155,63),
 ('brussels-shredded','Shredded Brussels Sprouts','broccoli','1 cup',88,38,3,7.9,0.3,3.3,1.9,22,33,74.8,37,1.2,342,54),
 ('coleslaw-mix','Coleslaw Mix (bagged)','veg','1 cup',85,20,1,4.8,0.1,1.9,2.6,15,15,30,34,0.4,145,35),
 ('butternut-cubed','Cubed Butternut Squash (bagged)','veg','1 cup',140,63,1.4,16.4,0.1,2.8,3.1,6,745,29.4,67,0.8,493,38),
 ('cauliflower-rice','Cauliflower Rice (bagged)','broccoli','1 cup',100,25,2,5,0.3,2,2,30,1,48,22,0.4,299,57),
 ('mirepoix','Mirepoix (onion, celery, carrot)','veg','1 cup',120,40,1,9,0.2,2.4,4.4,35,220,7,30,0.3,250,25),
 ('stir-fry-mix','Stir-Fry Vegetable Mix','wok','1 cup',100,35,2,7,0.2,2.5,3,25,200,45,35,0.7,250,45),
]

HERB = [
 ('basil','Fresh Basil','leaf','1/4 cup',6,1,0.2,0.1,0,0.1,0,0,16,1.1,11,0.2,18,4),
 ('cilantro','Fresh Cilantro','leaf','1/4 cup',4,1,0.1,0.1,0,0.1,0,2,15,1.1,3,0.1,21,2),
 ('parsley','Fresh Parsley','leaf','1/4 cup',15,5,0.4,0.8,0.1,0.5,0.1,8,63,20,21,0.9,84,23),
 ('mint','Fresh Mint','leaf','1/4 cup',6,3,0.2,0.5,0,0.3,0,2,12,1.9,12,0.4,34,7),
 ('dill','Fresh Dill','leaf','1/4 cup',2,1,0.1,0.1,0,0,0,1,15,1.7,4,0.1,15,3),
 ('rosemary','Fresh Rosemary','leaf','1 tbsp',2,2,0,0.3,0.1,0.2,0,0,3,0.4,6,0.1,13,2),
 ('thyme','Fresh Thyme','leaf','1 tbsp',2,2,0.1,0.5,0,0.3,0,0,10,3.2,8,0.4,12,2),
 ('sage','Fresh Sage','leaf','1 tbsp',2,2,0.1,0.3,0.1,0.2,0,0,2,0.6,7,0.1,7,1),
 ('oregano-fresh','Fresh Oregano','leaf','1 tbsp',6,3,0.1,0.7,0,0.4,0,1,4,1.8,10,0.3,16,7),
 ('chives','Fresh Chives','leaf','1 tbsp',3,1,0.1,0.1,0,0.1,0,0,13,1.7,3,0.1,9,3),
 ('tarragon','Fresh Tarragon','leaf','1 tbsp',2,5,0.4,0.9,0.1,0.1,0,1,1,0.1,23,0.7,63,5),
 ('lemongrass','Lemongrass','leaf','1 stalk',20,20,0.4,5.1,0.1,0.1,0,1,0,0.5,13,1.6,144,15),
 ('curry-leaves','Fresh Curry Leaves','leaf','10 leaves',2,2,0.1,0.3,0,0.2,0,1,15,1.2,16,0.2,10,2),
 ('thai-basil','Thai Basil','leaf','1/4 cup',6,1,0.2,0.1,0,0.1,0,0,16,1.1,11,0.2,18,4),
 ('bay-leaf-fresh','Fresh Bay Leaves','leaf','2 leaves',1,3,0.1,0.7,0.1,0.3,0,0,6,0.5,8,0.4,5,2),
]

CATS = [('fruit', FRUIT), ('veg', VEG), ('herb', HERB)]


def scores(cat, kcal, prot, fib):
    """The library's 0-10 quality scores, assigned by category rather than by
    hand so the same food never scores two different ways."""
    s = dict(animal_protein=0, plant_protein=0, saturated_fat=0,
             unsaturated_fat=0, whole_grains=0, vegetables=0, fruits=0,
             simple_carbs=0, fiber=0, alcohol=0)
    if cat == 'fruit':
        s['fruits'] = 1
    else:
        s['vegetables'] = 1 if cat == 'veg' else 0.5
    if prot >= 4:
        s['plant_protein'] = 0.5
    if fib >= 3:
        s['fiber'] = 1
    elif fib >= 1.5:
        s['fiber'] = 0.5
    return s


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    rows = []
    for cat, table in CATS:
        for (rid, name, icon, serving, g, kcal, p, c, f, fib, sug, na,
             va, vc, ca, fe, k, fol) in table:
            s = scores(cat, kcal, p, fib)
            mt = 'Snack' if cat != 'veg' else 'Dinner'
            rows.append(
                f"('prod-{rid}', {q(name)}, {q(mt)}, {q(icon)}, {q(serving)}, "
                f"{s['animal_protein']}, {s['plant_protein']}, 0, 0, 0, "
                f"{s['vegetables']}, {s['fruits']}, 0, {s['fiber']}, 0, "
                f"{kcal}, {p}, {c}, {f}, {fib}, {sug}, {na}, "
                f"{va}, {vc}, 0, {ca}, {fe}, {k}, {fol}, 0, 0, 0, {g})")

    print('-- Produce from a Safeway / Trader Joe\'s produce aisle.')
    print('-- Generated by tools/seed_produce.py — do not hand-edit.')
    print('-- Values are per the stated serving. Re-runnable: conflicts are skipped,')
    print('-- and anything already in the library under another id is filtered out.')
    print()
    print('insert into cozyhealth.generic_meals')
    print('  (id, name, meal_type, icon, notes,')
    print('   animal_protein, plant_protein, saturated_fat, unsaturated_fat,')
    print('   whole_grains, vegetables, fruits, simple_carbs, fiber, alcohol,')
    print('   calories, protein_grams, carbs_grams, fat_grams, fiber_grams,')
    print('   sugar_grams, sodium_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg,')
    print('   calcium_mg, iron_mg, potassium_mg, folate_mcg, choline_mg,')
    print('   omega3_dha_mg, omega3_epa_mg, serving_grams)')
    print('select v.* from (values')
    print(',\n'.join('  ' + r for r in rows))
    print(''') as v(id, name, meal_type, icon, notes,
       animal_protein, plant_protein, saturated_fat, unsaturated_fat,
       whole_grains, vegetables, fruits, simple_carbs, fiber, alcohol,
       calories, protein_grams, carbs_grams, fat_grams, fiber_grams,
       sugar_grams, sodium_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg,
       calcium_mg, iron_mg, potassium_mg, folate_mcg, choline_mg,
       omega3_dha_mg, omega3_epa_mg, serving_grams)
where not exists (
  -- skip anything the library already carries under a different id, matching
  -- on the leading name before any parenthetical serving note
  select 1 from cozyhealth.generic_meals g
  where lower(split_part(g.name, ' (', 1)) = lower(split_part(v.name, ' (', 1))
)
on conflict (id) do nothing;''')
    print()
    print(f'-- {len(rows)} produce rows offered', file=sys.stderr)


if __name__ == '__main__':
    main()
