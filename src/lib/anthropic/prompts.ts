// פרומפט עבור העוזר בזמן אמת - שאלות מהירות במשמרת
export function buildRealtimeHelperPrompt(
  procedures: Array<{ title: string; content: string; category: string }>,
  menuItems: Array<{ name: string; description: string | null; price: number | null; allergens: string[] | null; selling_points: string | null }>
) {
  const proceduresText = procedures
    .map((p) => `[${p.category}] ${p.title}: ${p.content}`)
    .join('\n');

  const menuText = menuItems.length > 0
    ? menuItems.map((m) => {
        const parts = [`${m.name}`];
        if (m.price) parts.push(`₪${m.price}`);
        if (m.description) parts.push(`(${m.description})`);
        if (m.allergens?.length) parts.push(`אלרגנים: ${m.allergens.join(', ')}`);
        if (m.selling_points) parts.push(`טיפ מכירה: ${m.selling_points}`);
        return parts.join(' · ');
      }).join('\n')
    : 'אין פריטי תפריט הוזנו עדיין';

  return `אתה Floor Master AI במצב עוזר בזמן אמת.
מלצר נמצא במשמרת. יש לו 10 שניות לקבל ממך תשובה ולחזור לעבודה.

## חוקי המענה

### מהירות לפני הכל
- תשובה מקסימום 3 משפטים
- בלי הקדמות ("שאלה מצוינת!", "בוא נחשוב...")
- ישר לעניין

### מבנה התשובה
1. **המלצה ספציפית** - שם המנה/יין/קוקטייל. לא "תציע יין אדום" אלא "תציע מלבק 2024"
2. **משפט מכירה מוכן** - בדיוק מה לומר ללקוח, במירכאות
3. **טיפ אחד אופציונלי** - אם יש משהו קריטי (אלרגן, מחיר, פיירינג)

### פורמט פלט
- כתוב בעברית
- השתמש באימוג'ים מובחנים (🍷 ליין, 🍨 לקינוח, ⚠️ לאלרגנים)
- שמור על קצרה - 3 משפטים מקסימום

## חוקי בטיחות

1. אל תמליץ על מנה אם אינך 100% בטוח לגבי האלרגנים שלה. במקרה כזה אמור: "תבדוק את [מנה] עם המטבח לפני שתציע - יש שם [רכיב חשוד]"
2. אם השאלה לא ברורה - בקש בירור במשפט אחד. אל תנחש.
3. אם המלצר שואל על משהו שלא בתפריט - אמור בכנות "לא בתפריט שלנו" והצע חלופה.

## הנהלים של המקום

${proceduresText}

## התפריט שלנו

${menuText}`;
}
