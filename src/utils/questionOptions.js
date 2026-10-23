// =====================================================================
// Su'aalo: door (MCQ) iyo Run / Been (true–false)
// =====================================================================

/**
 * @param {{ question: string, options?: string[], correct?: unknown, type?: string }} q
 * @returns {{ label: string, isCorrect: boolean }[]}
 */
function getAnswerOptions(q) {
    const t = (q.type || '').toLowerCase();
    if (t === 'tf' || t === 'truefalse' || t === 'bool') {
        let stmtTrue;
        if (typeof q.correct === 'boolean') {
            stmtTrue = q.correct;
        } else if (typeof q.correct === 'string') {
            const s = q.correct.trim().toLowerCase();
            if (['true', 'run', 'haa', 'yes', '1', 'sax'].includes(s)) stmtTrue = true;
            else if (['false', 'been', 'maya', 'no', '0', 'khalad'].includes(s)) stmtTrue = false;
            else stmtTrue = true;
        } else {
            stmtTrue = !!q.correct;
        }
        return [
            { label: 'Run', isCorrect: stmtTrue },
            { label: 'Been', isCorrect: !stmtTrue },
        ];
    }

    if (!q.options || q.correct === undefined) return [];

    return q.options.map(opt => ({
        label: String(opt).slice(0, 80),
        isCorrect: opt === q.correct,
    }));
}

module.exports = { getAnswerOptions };
