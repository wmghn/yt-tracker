import { useState } from "react";
import type { GroupConfig } from "@/types";

interface Props {
  config: GroupConfig;
  onChange: (config: GroupConfig) => void;
  onNext: () => void;
}

export default function WeightConfig({ config, onChange, onNext }: Props) {
  const [editorVal, setEditorVal] = useState(String(config.editorWeight));
  const [contentVal, setContentVal] = useState(String(config.contentWeight));

  const editor = parseInt(editorVal) || 0;
  const content = parseInt(contentVal) || 0;
  const sum = editor + content;
  const valid = sum === 100 && editor >= 0 && content >= 0;

  const handleEditor = (v: string) => {
    setEditorVal(v);
    const n = parseInt(v) || 0;
    setContentVal(String(100 - n));
    if (parseInt(v) >= 0 && parseInt(v) <= 100) {
      onChange({ editorWeight: n, contentWeight: 100 - n });
    }
  };

  const handleContent = (v: string) => {
    setContentVal(v);
    const n = parseInt(v) || 0;
    setEditorVal(String(100 - n));
    if (parseInt(v) >= 0 && parseInt(v) <= 100) {
      onChange({ editorWeight: 100 - n, contentWeight: n });
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-2">Cấu hình tỷ trọng</h1>
        <p className="text-slate-400 text-sm">
          Mỗi video được chia cho 2 nhóm: Editor và Content. Thiết lập % đóng góp của từng nhóm áp dụng cho toàn bộ file.
        </p>
      </div>

      <div className="card p-6 mb-6">
        {/* Visual bar */}
        <div className="mb-6">
          <div className="flex rounded-lg overflow-hidden h-8 mb-2">
            <div
              className="bg-blue-500/60 flex items-center justify-center text-xs font-medium text-white transition-all"
              style={{ width: `${editor}%` }}
            >
              {editor > 10 && `Editor ${editor}%`}
            </div>
            <div
              className="bg-purple-500/60 flex items-center justify-center text-xs font-medium text-white transition-all"
              style={{ width: `${content}%` }}
            >
              {content > 10 && `Content ${content}%`}
            </div>
          </div>
          <div className={`text-xs text-right transition-colors ${valid ? "text-slate-500" : "text-red-400"}`}>
            Tổng: {sum}% {!valid && "— phải bằng 100%"}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2" />
              Editor %
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={editorVal}
                onChange={(e) => handleEditor(e.target.value)}
                className="input pr-8 text-lg font-medium"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-2" />
              Content %
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={contentVal}
                onChange={(e) => handleContent(e.target.value)}
                className="input pr-8 text-lg font-medium"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
          </div>
        </div>

        {/* Slider */}
        <div className="mt-5">
          <input
            type="range"
            min="0"
            max="100"
            value={editor}
            onChange={(e) => handleEditor(e.target.value)}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>0% Editor</span>
            <span>50/50</span>
            <span>100% Editor</span>
          </div>
        </div>
      </div>

      {/* Example calculation */}
      <div className="card p-4 mb-6 border-border/50">
        <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Ví dụ tính toán</p>
        <div className="text-xs text-slate-400 space-y-1 font-mono">
          <p>Video: 1.000 views · 2 editors · 1 content</p>
          <p className="text-blue-400">Editor pool = 1.000 × {editor}% = {Math.round(1000 * editor / 100)} → mỗi editor = {Math.round(1000 * editor / 100)} ÷ 2 = <span className="text-white font-medium">{Math.round(1000 * editor / 100 / 2)} views</span></p>
          <p className="text-purple-400">Content pool = 1.000 × {content}% = <span className="text-white font-medium">{Math.round(1000 * content / 100)} views</span></p>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!valid}
        className="btn-primary w-full"
      >
        Tiếp theo →
      </button>
    </div>
  );
}
