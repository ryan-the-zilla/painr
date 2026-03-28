import React from 'react';

import { ROLE_OPTIONS } from '../../utils/profileCatalog';
import { type UserRole } from '../../utils/profile';

interface ProfileFormProps {
  error?: string | null;
  name: string;
  onNameChange: (value: string) => void;
  onRoleChange: (value: UserRole) => void;
  role: UserRole | null;
}

export function ProfileForm({
  error,
  name,
  onNameChange,
  onRoleChange,
  role,
}: ProfileFormProps) {
  return (
    <div className="profile-form-fields">
      <div>
        <div className="field-label-row">
          <label className="field-label">Naam</label>
          <span className="field-hint">Optioneel</span>
        </div>
        <input
          value={name}
          onChange={event => onNameChange(event.target.value)}
          placeholder="Bijv. Ryan"
          className="input"
          autoComplete="name"
          style={{ fontSize: '0.88rem' }}
        />
      </div>

      <div>
        <div className="field-label-row">
          <label className="field-label">Rol</label>
          <span className="field-hint">Verplicht voor de ranking</span>
        </div>
        <div className="role-grid">
          {ROLE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onRoleChange(option.value)}
              className={`role-card ${role === option.value ? 'active' : ''}`}
            >
              <span className="role-card-title">{option.label}</span>
              <span className="role-card-copy">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="profile-form-error">{error}</p>}
    </div>
  );
}
