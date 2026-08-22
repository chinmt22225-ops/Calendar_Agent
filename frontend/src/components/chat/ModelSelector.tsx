import { useState, useEffect, useRef } from 'react'
import { Sparkles, ChevronDown, Check, Eye, Zap, Shield, Brain } from 'lucide-react'
import { fetchChatModels } from '../../api/chat'
import type { ChatModelInfo } from '../../types/chat'

const DEFAULT_MODELS: ChatModelInfo[] = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'google',
    tier: 'top',
    tier_label: 'Thông minh cao cấp',
    intelligence_score: 9.9,
    supports_vision: true,
    supports_tools: true,
    description: 'Thế hệ Flash 3.6 mới nhất, tư duy tiếng Việt xuất sắc, đọc ảnh đỉnh cao',
    badge_color: '#d93662',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'google',
    tier: 'top',
    tier_label: 'Thông minh cao cấp',
    intelligence_score: 9.8,
    supports_vision: true,
    supports_tools: true,
    description: 'Hiểu tiếng Việt sâu sắc, xử lý lịch học & deadline nhiều bước',
    badge_color: '#e11d48',
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    provider: 'google',
    tier: 'balanced',
    tier_label: 'Cân bằng & Tốc độ',
    intelligence_score: 9.5,
    supports_vision: true,
    supports_tools: true,
    description: 'Bản Flash tiêu chuẩn tự động cập nhật, ổn định và nhanh chóng',
    badge_color: '#5656d8',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'google',
    tier: 'balanced',
    tier_label: 'Cân bằng & Tốc độ',
    intelligence_score: 9.3,
    supports_vision: true,
    supports_tools: true,
    description: 'Siêu nhẹ thế hệ 3.5, phản hồi cực nhanh (~300ms), tiết kiệm token',
    badge_color: '#0f8f83',
  },
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash Lite',
    provider: 'google',
    tier: 'speed',
    tier_label: 'Siêu nhẹ & Quota cao',
    intelligence_score: 9.0,
    supports_vision: true,
    supports_tools: true,
    description: 'Bản Lite mới nhất, hạn mức request dồi dào và tốc độ cao',
    badge_color: '#df5a27',
  },
]

interface ModelSelectorProps {
  selectedModel: string
  onSelectModel: (modelId: string) => void
}

export function ModelSelector({ selectedModel, onSelectModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [models, setModels] = useState<ChatModelInfo[]>(DEFAULT_MODELS)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchChatModels()
      .then((data) => {
        if (data && data.length > 0) setModels(data)
      })
      .catch(() => {
        // Fallback to default models
      })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const currentModel = models.find((m) => m.id === selectedModel)
  const isAuto = selectedModel === 'auto' || !selectedModel

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all duration-150 shadow-sm"
        title="Chọn mô hình AI hoặc để Tự động tối ưu"
      >
        {isAuto ? (
          <>
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-amber-300 font-semibold">Tự động (Auto)</span>
          </>
        ) : (
          <>
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: currentModel?.badge_color || '#d93662' }}
            />
            <span className="truncate max-w-[130px]">{currentModel?.name || selectedModel}</span>
          </>
        )}
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-80 md:w-96 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl shadow-black/80 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-semibold text-slate-200">
                Mô hình AI (Xếp theo độ thông minh)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-800">
              {models.length} Model
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
            {/* Auto Option */}
            <div className="pb-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectModel('auto')
                  setIsOpen(false)
                }}
                className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-all ${
                  isAuto
                    ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200'
                    : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="mt-0.5 p-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-amber-300">Tự động tối ưu (Auto Fallback)</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Khuyên dùng
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Tự động chọn model thông minh nhất. Khi chạm hạn mức sẽ trượt mượt mà sang model tiếp theo.
                  </p>
                </div>
                {isAuto && <Check className="w-4 h-4 text-rose-400 shrink-0 mt-1" />}
              </button>
            </div>

            {/* Models list in descending intelligence */}
            <div className="pt-1.5 space-y-1">
              {models.map((model) => {
                const isSelected = selectedModel === model.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(model.id)
                      setIsOpen(false)
                    }}
                    className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-rose-950/30 border border-rose-500/40 text-rose-200'
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div
                      className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-slate-900"
                      style={{ backgroundColor: model.badge_color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-semibold text-slate-200 truncate">{model.name}</span>
                          {model.supports_vision && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded bg-sky-950/60 text-sky-300 border border-sky-800/50 shrink-0" title="Hỗ trợ đọc ảnh thời khóa biểu">
                              <Eye className="w-2.5 h-2.5" /> Ảnh
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                            {model.intelligence_score}/10
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 leading-tight">
                        {model.description}
                      </p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-rose-400 shrink-0 mt-1" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
