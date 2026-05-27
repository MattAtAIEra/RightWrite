import { useState } from "react";
import { usePersonalization } from "./PersonalizationContext";
import { AVAILABLE_EMOJIS } from "../storage/types";

export default function ProfilePicker() {
  const { profiles, activeProfile, setActiveProfile, createProfile, deleteProfile } = usePersonalization();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string>(AVAILABLE_EMOJIS[0]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const p = await createProfile(trimmed.slice(0, 6), emoji);
    await setActiveProfile(p.id);
    setName("");
    setEmoji(AVAILABLE_EMOJIS[0]);
    setShowAdd(false);
  };

  const handleDelete = async (id: string, displayName: string) => {
    if (!confirm(`要刪除 ${displayName} 的所有紀錄嗎？此動作無法復原。`)) return;
    await deleteProfile(id);
  };

  return (
    <div className="profile-picker">
      <div className="profile-picker-cards">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`profile-card ${activeProfile?.id === p.id ? "active" : ""}`}
            onClick={() => setActiveProfile(p.id)}
          >
            <span className="profile-emoji">{p.emoji}</span>
            <span className="profile-name">{p.name}</span>
            <span
              className="profile-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(p.id, p.name);
              }}
              role="button"
              aria-label={`刪除 ${p.name}`}
            >
              ×
            </span>
          </button>
        ))}
        <button className="profile-add-btn" onClick={() => setShowAdd(true)}>
          ➕ 新增
        </button>
      </div>

      {showAdd && (
        <div className="profile-add-modal" role="dialog">
          <div className="profile-add-modal-content">
            <h3>新增小朋友</h3>
            <label>
              名字（最多 6 字）
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 6))}
                placeholder="小明"
                autoFocus
              />
            </label>
            <label>選個動物</label>
            <div className="emoji-grid">
              {AVAILABLE_EMOJIS.map((e) => (
                <button
                  key={e}
                  className={`emoji-option ${emoji === e ? "selected" : ""}`}
                  onClick={() => setEmoji(e)}
                  type="button"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="profile-add-actions">
              <button onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary" onClick={handleAdd} disabled={!name.trim()}>
                建立
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
