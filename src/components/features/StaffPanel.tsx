import { useState } from "react";
import type { StaffMember, VideoRow } from "@/types";
import StaffCard from "./StaffCard";

interface Props {
  staffList: StaffMember[];
  videos: VideoRow[];
  onChange: (staffList: StaffMember[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StaffPanel({ staffList, videos, onChange, onNext, onBack }: Props) {
  const [showNew, setShowNew] = useState(staffList.length === 0);

  const handleSave = (staff: StaffMember) => {
    const exists = staffList.find((s) => s.id === staff.id);
    if (exists) {
      onChange(staffList.map((s) => (s.id === staff.id ? staff : s)));
    } else {
      onChange([...staffList, staff]);
    }
    setShowNew(false);
  };

  const handleDelete = (id: string) => {
    onChange(staffList.filter((s) => s.id !== id));
  };

  const totalMatched = staffList.reduce((sum, s) => sum + s.videoIds.length, 0);
  const canProceed = staffList.length > 0 && totalMatched > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Nhân sự & Video IDs</h1>
          <p className="text-slate-400 text-sm">
            Thêm từng nhân sự và dán danh sách video ID họ đã làm trong tháng.
          </p>
        </div>
        {staffList.length > 0 && (
          <div className="text-right text-xs text-slate-500 mt-1">
            <div className="text-white font-medium">{staffList.length} nhân sự</div>
            <div>{totalMatched} video assignments</div>
          </div>
        )}
      </div>

      {/* Staff list */}
      <div className="space-y-3 mb-3">
        {staffList.map((staff) => (
          <StaffCard
            key={staff.id}
            staff={staff}
            videos={videos}
            onSave={handleSave}
            onDelete={() => handleDelete(staff.id)}
          />
        ))}
      </div>

      {/* New staff form */}
      {showNew ? (
        <StaffCard
          videos={videos}
          onSave={(staff) => { handleSave(staff); }}
          isNew
        />
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="w-full border border-dashed border-border hover:border-white/20 rounded-xl py-3.5 text-sm text-slate-500 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span>
          Thêm nhân sự
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="btn-ghost">
          ← Quay lại
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="btn-primary flex-1"
        >
          Tính toán kết quả →
        </button>
      </div>

      {!canProceed && staffList.length > 0 && (
        <p className="text-xs text-amber-400/70 text-center mt-2">
          Cần ít nhất 1 nhân sự có video ID khớp với file upload
        </p>
      )}
    </div>
  );
}
