import useCandidateStore from '../store/candidateStore'

const DIMENSIONS = [
  { key: 'research', label: 'Research' },
  { key: 'education', label: 'Education' },
  { key: 'employment', label: 'Employment' },
  { key: 'skills', label: 'Skills' },
  { key: 'supervision', label: 'Supervision' },
]

export default function WeightSliders() {
  const { weights, setWeights, resetWeights } = useCandidateStore()
  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  const handleChange = (key, value) => {
    setWeights({ ...weights, [key]: Number(value) })
  }

  return (
    <div className="bg-white rounded-xl shadow p-5 w-72">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-[#1a3557] text-sm uppercase tracking-wide">
          Score Weights
        </h3>
        <button
          onClick={resetWeights}
          className="text-xs text-blue-600 hover:underline"
        >
          Reset
        </button>
      </div>

      {DIMENSIONS.map(({ key, label }) => (
        <div key={key} className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-600">{label}</span>
            <span className="font-medium text-[#1a3557]">{weights[key]}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weights[key]}
            onChange={(e) => handleChange(key, e.target.value)}
            className="w-full accent-blue-600"
          />
        </div>
      ))}

      <div
        className={`mt-3 text-xs text-center font-medium ${
          Math.abs(total - 100) > 1 ? 'text-red-500' : 'text-emerald-600'
        }`}
      >
        Total: {total}% {Math.abs(total - 100) > 1 ? '— must equal 100%' : ''}
      </div>
    </div>
  )
}
