// Insert optional questions in display order only. Never renumber persisted
// questions: historical answers and media can still refer to their sequence.
export function journeyQuestionOrder(questions) {
  const meta=q=>q.meta_json || q;
  const extras=questions.filter(q=>meta(q).question_role==='theme_extra');
  const result=questions.filter(q=>meta(q).question_role!=='theme_extra');
  for(const q of extras){
    const code=meta(q).theme_code;
    let after=-1;
    result.forEach((item,i)=>{
      const m=meta(item);
      if(m.theme_code===code && !['trial_experience','starting_conversation','life_outline','starting_motivation'].includes(m.onboarding_group || item.group))after=i;
    });
    result.splice(after<0?result.length:after+1,0,q);
  }
  return result;
}
