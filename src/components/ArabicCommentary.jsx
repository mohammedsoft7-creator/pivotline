import { BookOpenText, GitBranch, Target } from 'lucide-react'
export default function ArabicCommentary({ commentary, model }) {
  return (
    <section className="brief panel">
      <div className="panel-heading brief-heading">
        <BookOpenText size={18} />
        <h2>Analysis brief</h2>
        <span className="brief-model">{model}</span>
      </div>
      <div className="arabic-grid" dir="rtl" lang="ar">
        <article>
          <h3>
            <GitBranch size={16} />
            الصورة الكبيرة والهيكل الداخلي
          </h3>
          <p>{commentary.structure}</p>
          <p className="details">{commentary.details}</p>
        </article>
        <article>
          <h3>
            <Target size={17} />
            السيناريو المتوقع وشروط الإلغاء
          </h3>
          <p>
            {commentary.scenario}{' '}
            {commentary.target && (
              <bdi className="target">{commentary.target}</bdi>
            )}
          </p>
          <p className="details">
            <strong>شرط الإلغاء</strong> · {commentary.invalidation}
          </p>
        </article>
      </div>
    </section>
  )
}
