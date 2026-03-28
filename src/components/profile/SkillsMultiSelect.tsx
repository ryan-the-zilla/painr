import React, { useMemo, useState } from 'react';

import { type SkillGroup } from '../../utils/profileCatalog';

interface SkillsMultiSelectProps {
  disabled?: boolean;
  groups: SkillGroup[];
  maxSelected?: number;
  onChange: (skills: string[]) => void;
  selectedSkills: string[];
}

export function SkillsMultiSelect({
  disabled = false,
  groups,
  maxSelected = 5,
  onChange,
  selectedSkills,
}: SkillsMultiSelectProps) {
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return groups
      .map(group => ({
        ...group,
        options: group.options.filter(option => option.toLowerCase().includes(normalizedQuery)),
      }))
      .filter(group => group.options.length > 0);
  }, [groups, query]);

  const canAddMore = selectedSkills.length < maxSelected;

  const toggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      onChange(selectedSkills.filter(item => item !== skill));
      return;
    }

    if (!canAddMore) return;
    onChange([...selectedSkills, skill]);
  };

  const removeSkill = (skill: string) => {
    onChange(selectedSkills.filter(item => item !== skill));
  };

  return (
    <div className={`skills-select ${disabled ? 'disabled' : ''}`}>
      <div className="skills-inline-shell">
        <div className="skills-inline-header">
          <input
            className="skills-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={disabled ? 'Kies eerst je rol' : 'Zoek skills...'}
            disabled={disabled}
          />
          <span className="skills-limit-note">
            {selectedSkills.length}/{maxSelected}
          </span>
        </div>

        <div className="skills-selected-panel">
          {selectedSkills.length > 0 ? (
            <div className="skills-chip-list">
              {selectedSkills.map(skill => (
                <span key={skill} className="skills-chip">
                  {skill}
                  <button
                    type="button"
                    className="skills-chip-remove"
                    onClick={event => {
                      event.stopPropagation();
                      removeSkill(skill);
                    }}
                    aria-label={`${skill} verwijderen`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="skills-placeholder">
              {disabled ? 'Kies eerst je rol' : 'Kies tot 5 skills'}
            </span>
          )}
        </div>

        {!disabled && (
          <div className="skills-groups" role="listbox" aria-multiselectable="true">
            {filteredGroups.length > 0 ? (
              filteredGroups.map(group => (
                <div key={group.label} className="skills-group">
                  <div className="skills-group-title">{group.label}</div>
                  <div className="skills-option-list">
                    {group.options.map(option => {
                      const selected = selectedSkills.includes(option);
                      const blocked = !selected && !canAddMore;

                      return (
                        <button
                          key={option}
                          type="button"
                          className={`skills-option ${selected ? 'selected' : ''}`}
                          onClick={() => toggleSkill(option)}
                          disabled={blocked}
                          aria-selected={selected}
                        >
                          <span>{option}</span>
                          {selected && <span className="skills-option-check">Geselecteerd</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="skills-empty-state">
                Geen skills gevonden{query.trim() ? ` voor "${query.trim()}"` : '.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
