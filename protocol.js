export function validate(value, schema, rules) {
  function visit(v, s, path) {
    if (s.$ref) return visit(v, schema.$defs[s.$ref.split('/').at(-1)], path);
    if (s.anyOf) {
      if (!s.anyOf.some(option => visit(v, option, path).length === 0)) return [path + ' 值无效'];
      return [];
    }
    if (Object.hasOwn(s, 'const') && v !== s.const) return [path + ' 必须为 ' + s.const];
    if (s.enum && !s.enum.includes(v)) return [path + ' 可选 ' + s.enum.join(' / ')];
    if (s.type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [path + ' 必须为对象'];
      const errors = s.required.filter(k => !Object.hasOwn(v,k)).map(k => path + '.' + k + ' 缺失');
      for (const [k, field] of Object.entries(v)) {
        if (!Object.hasOwn(s.properties, k)) errors.push(path + '.' + k + ' 未定义');
        else errors.push(...visit(field, s.properties[k], path + '.' + k));
      }
      return errors;
    }
    if (s.type === 'array') {
      if (!Array.isArray(v) || v.length < s.minItems || new Set(v).size !== v.length) return [path + ' 必须为非空且无重复的数组'];
      return v.flatMap((item, i) => visit(item, s.items, path + '[' + i + ']'));
    }
    if (s.type === 'string') {
      if (typeof v !== 'string' || v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity) || (s.pattern && !new RegExp(s.pattern).test(v))) return [path + ' 文本格式或长度无效'];
    } else if (s.type === 'number' || s.type === 'integer') {
      if (!Number.isFinite(v) || (s.type === 'integer' && !Number.isInteger(v)) || v < s.minimum || v > s.maximum) return [path + ' 必须在 ' + s.minimum + '–' + s.maximum + ' 范围内' + (s.type === 'integer' ? '且为整数' : '')];
    } else if (s.type && (s.type === 'null' ? v !== null : typeof v !== s.type)) return [path + ' 类型无效'];
    return [];
  }
  const errors = visit(value, schema, '$');
  if (!errors.length) {
    if (!rules) errors.push('不支持的规则版本 ' + value.rule_version);
    else {
      const cap = rules.densityCaps[value.brief.category] ?? rules.density[1];
      if (value.design.graphic_density > cap) errors.push('此类别在规则 ' + rules.version + ' 的图形密度上限为 ' + cap);
    }
  }
  return errors;
}

export const blankApproval = () => ({brief_approved:false,concept_approved:false,final_approved:false});

export const samples = [
  ['城市与艺术','City and Art','当代艺术文化讲座','探索艺术与城市生活之间的联系','lecture','交流与碰撞','P03','asymmetric','cross',1024],
  ['探索的边界','Beyond Boundaries','公共教育计划','从未知出发，发现日常空间里的新可能','education','开放与发现','P02','graphic_dominant','radial',2347],
  ['时间的档案','Archive of Time','文化知识传播计划','以档案与阅读梳理城市的时间线索','culture','秩序与记忆','P01','bilingual_columns','parallel',5641]
];

export function sample(i, rules) {
  const [title_zh,title_en,subtitle,description,category,concept,palette_id,layout,graphic_strategy,seed] = samples[i];
  return {
    schema_version:'1.0', task_id:'TEST-00' + (i + 1), rule_version:rules.version, research_only:true,
    brief:{category,audience:'public',purpose:'文化活动宣传'},
    content:{title_zh,title_en,subtitle,description,date:null,location:null},
    design:{concept,palette_id,layout,graphic_strategy,graphic_density:Math.min(.55,rules.densityCaps[category] ?? .85),title_size_ratio:.09,seed},
    outputs:Object.keys(rules.media), approval:blankApproval()
  };
}
