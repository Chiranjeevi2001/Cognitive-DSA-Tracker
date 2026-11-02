import { useState } from 'react';
import { addDays, daysBetween, formatDate, parseDateKey } from './schedule';

export function ActivityHeatmap({ counts, today }: { counts: Record<string, number>; today: string }) {
  const [selectedDate, setSelectedDate] = useState<string>();
  const start = addDays(today, -364);
  const gridStart = addDays(start, -parseDateKey(start).getDay());
  const days = Array.from({ length: daysBetween(gridStart, today) + 1 }, (_, index) => addDays(gridStart, index));
  const visibleDays = days.filter((date) => date >= start);
  const total = visibleDays.reduce((sum, date) => sum + (counts[date] ?? 0), 0);
  const activeDays = visibleDays.filter((date) => counts[date] > 0).length;
  const detailDate = selectedDate ?? today;
  const detailCount = counts[detailDate] ?? 0;

  return (
    <section className="activity" aria-labelledby="activity-title">
      <div className="activity-heading">
        <div>
          <h2 id="activity-title">Solving activity</h2>
          <p>Problems solved per day, including successful reviews</p>
        </div>
        <span>Past 12 months</span>
      </div>
      <div className="activity-scroll">
        <div className="activity-calendar">
          <div className="activity-months" aria-hidden="true">
            {days.filter((_, index) => index % 7 === 0).map((date, week) => {
              const monthDate = parseDateKey(date);
              const showMonth = week === 0 || monthDate.getDate() <= 7;
              return <span key={date} style={{ gridColumn: week + 1 }}>{showMonth ? monthDate.toLocaleDateString(undefined, { month: 'short' }) : ''}</span>;
            })}
          </div>
          <div className="activity-weekdays" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
          <div className="activity-grid">
            {days.map((date) => {
              const count = counts[date] ?? 0;
              const label = `${formatDate(date)}: ${count} problem${count === 1 ? '' : 's'} solved`;
              return date < start ? <span key={date} /> : (
                <button key={date} type="button" className={`activity-day level-${Math.min(count, 4)}`}
                  aria-label={label} title={label} aria-pressed={selectedDate === date}
                  onFocus={() => setSelectedDate(date)} onMouseEnter={() => setSelectedDate(date)}
                  onClick={() => setSelectedDate(date)} />
              );
            })}
          </div>
        </div>
      </div>
      <div className="activity-footer">
        <span>{total} daily solves across {activeDays} active days</span>
        <div className="activity-legend" aria-label="Color scale: zero, one, two, three, four or more problems solved">
          Less {[0, 1, 2, 3, 4].map((level) => <span key={level} className={`level-${level}`} />)} More
        </div>
      </div>
      <p className="activity-detail" aria-live="polite">{formatDate(detailDate)}: {detailCount} problem{detailCount === 1 ? '' : 's'} solved</p>
    </section>
  );
}
