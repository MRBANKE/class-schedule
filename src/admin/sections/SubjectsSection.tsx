import { useState } from 'react';
import type {
  Student,
  SubjectItem,
  Weekday,
} from '../../config/types';
import { WEEKDAYS } from '../../config/types';
import { SvgIcon } from '../../icons';
import SubjectIcon from '../../components/SubjectIcon';
import SubjectEditor from '../SubjectEditor';

interface Props {
  student: Student;
  onChange: (patch: Partial<Student>) => void;
}

const PRESET_COLORS = [
  '#FCE7DC', '#DDE7FA', '#E4D8F5', '#F5E7C4', '#FCE1C6', '#F6D9F0',
  '#F7F1C7', '#D6EEDC', '#CFEEDE', '#D5E4FB', '#E4E1F7', '#DDD5F7',
  '#FBE5D6', '#FFF3C4', '#FED4DA', '#CFEDF3', '#D8F1CE', '#EBEBEB',
];

export default function SubjectsSection({ student, onChange }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [isNewEditor, setIsNewEditor] = useState<boolean>(false);

  const renameInSchedule = (
    oldName: string,
    newName: string,
  ): Record<Weekday, string[]> => {
    const nextSchedule = {} as Record<Weekday, string[]>;
    for (const day of WEEKDAYS) {
      nextSchedule[day] = student.schedule[day].map(v =>
        v === oldName ? newName : v,
      );
    }
    return nextSchedule;
  };

  const handleSave = (idx: number, next: SubjectItem, originalName: string) => {
    const list = student.subjects.map((s, i) => (i === idx ? next : s));
    if (originalName && originalName !== next.name) {
      onChange({
        subjects: list,
        schedule: renameInSchedule(originalName, next.name),
      });
    } else {
      onChange({ subjects: list });
    }
    setEditingIdx(null);
    setIsNewEditor(false);
  };

  const handleDelete = (idx: number) => {
    if (student.subjects.length <= 1) return;
    if (!window.confirm('确定删除该课程？课表中引用的相同名字课程会保留原名。'))
      return;
    onChange({ subjects: student.subjects.filter((_, i) => i !== idx) });
    setEditingIdx(null);
    setIsNewEditor(false);
  };

  const addSubject = () => {
    const preset = PRESET_COLORS[student.subjects.length % PRESET_COLORS.length];
    // 避免默认名撞上已有的"课程N"(比如删过课程后再新增)
    const taken = new Set(student.subjects.map(s => s.name.trim()));
    let idx = student.subjects.length + 1;
    while (taken.has(`课程${idx}`) && idx < student.subjects.length + 200) {
      idx += 1;
    }
    const next: SubjectItem = {
      name: `课程${idx}`,
      icon: 'book',
      color: preset,
      kind: 'class',
    };
    onChange({ subjects: [...student.subjects, next] });
    setEditingIdx(student.subjects.length);
    setIsNewEditor(true);
  };

  return (
    <div className="admin-section">
      <p className="admin-section-hint">点击卡片编辑,需点「保存」生效</p>

      <div className="admin-subject-grid">
        {student.subjects.map((s, idx) => (
          <button
            type="button"
            key={idx}
            className="admin-subject-card"
            style={{ background: s.color }}
            onClick={() => {
              setEditingIdx(idx);
              setIsNewEditor(false);
            }}
          >
            {!s.hideIcon && (
              <span className="admin-subject-card-icon">
                <SubjectIcon subject={s} size={20} />
              </span>
            )}
            <span className="admin-subject-card-name">
              {s.name || '未命名'}
            </span>
            {s.weekMode === 'biweekly' && (
              <span className="admin-subject-card-week">单/双</span>
            )}
            {s.kind === 'break' && (
              <span className="admin-subject-card-kind admin-subject-card-kind-break">
                休息
              </span>
            )}
            {s.kind === 'after-school' && (
              <span className="admin-subject-card-kind admin-subject-card-kind-after">
                课后
              </span>
            )}
            {s.reminder && (
              <span className="admin-subject-card-hint" title={s.reminder}>
                {s.reminder}
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          className="admin-subject-card admin-subject-card-add"
          onClick={addSubject}
        >
          <SvgIcon name="plus" size={22} />
          <span>新增课程</span>
        </button>
      </div>

      {editingIdx !== null && student.subjects[editingIdx] && (
        <SubjectEditor
          subject={student.subjects[editingIdx]}
          isNew={isNewEditor}
          allowDelete={student.subjects.length > 1}
          // 排除自己,让重名校验能识别"改成别人的名字"
          siblings={student.subjects.filter((_, i) => i !== editingIdx)}
          onSave={(next, originalName) =>
            handleSave(editingIdx, next, originalName)
          }
          onDelete={() => handleDelete(editingIdx)}
          onClose={() => {
            if (isNewEditor) {
              onChange({
                subjects: student.subjects.filter((_, i) => i !== editingIdx),
              });
            }
            setEditingIdx(null);
            setIsNewEditor(false);
          }}
        />
      )}
    </div>
  );
}
