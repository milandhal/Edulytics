import { useState } from 'react';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, uploadFileRequest } from '../lib/api';

type UploadTab = 'students' | 'subjects' | 'faculty';

const tabInfo = {
  students: {
    label: 'Students',
    icon: 'group',
    endpoint: '/api/v1/students/bulk-upload',
    columns: ['registration_number', 'name', 'program', 'branch', 'admission_year', 'current_semester', 'email?', 'phone?', 'section?'],
    sampleRows: [
      '23110001,Rahul Kumar,B.Tech,CSE,2023,1,rahul@outr.ac.in,9876543210,',
      '23110002,Priya Sharma,B.Tech,CSE,2023,1,priya@outr.ac.in,,A',
    ],
  },
  subjects: {
    label: 'Subjects',
    icon: 'menu_book',
    endpoint: '/api/v1/subjects/bulk-upload',
    columns: ['code', 'name', 'type', 'lecture_hours', 'tutorial_hours', 'practical_hours', 'credits', 'branch_codes', 'semester'],
    sampleRows: [
      'CS-401,Data Structures & Algorithms,THEORY,3,0,0,3,CSE;IT,4',
      'CS-404L,Networks Lab,LAB,0,0,3,1.5,CSE,4',
    ],
  },
  faculty: {
    label: 'Faculty',
    icon: 'badge',
    endpoint: '/api/v1/users/bulk-upload',
    columns: ['name', 'designation', 'phoneno', 'email', 'department?'],
    sampleRows: [
      'Dr. Ranjan Kumar Dash,Asso. Professor & HOD,9437360517,rkdas@outr.ac.in,IT',
      'Mr. Sanjit Kumar Dash,Lecturer,9437990832,skdash@outr.ac.in,IT',
    ],
  },
};

interface UploadResult {
  saved: number;
  errors: { row: number; identifier: string; reason: string }[];
}

export function BulkUpload() {
  const [tab, setTab] = useState<UploadTab>('students');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const info = tabInfo[tab];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    try {
      const data = await uploadFileRequest(info.endpoint, file);
      const saved = data.saved ?? (data.created ?? 0) + (data.updated ?? 0);
      setResult({
        saved,
        errors: data.errors.map((item) => ({
          row: item.row,
          identifier: item.identifier ?? item.email ?? '-',
          reason: item.reason,
        })),
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Upload failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (value: UploadTab) => {
    setTab(value);
    setFile(null);
    setResult(null);
    setError('');
  };

  const sampleCsv = [info.columns.join(','), ...info.sampleRows].join('\n');

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Bulk Data Upload"
        description="Admin only - CSV or Excel (.xlsx) - Max 5MB."
      />

      <div className="mb-6 flex gap-2">
        {(Object.entries(tabInfo) as [UploadTab, typeof tabInfo.students][]).map(([key, value]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              tab === key
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'border border-outline-variant/20 bg-white text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{value.icon}</span>
            {value.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-outline-variant/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="material-symbols-outlined text-base text-primary">upload_file</span>
              Upload {info.label} CSV
            </h2>

            <label className={`flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
              file
                ? 'border-primary bg-primary/5'
                : 'border-outline-variant/30 bg-surface-container-low hover:border-primary/40 hover:bg-surface-container'
            }`}>
              <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="hidden" />
              {file ? (
                <>
                  <span className="material-symbols-outlined mb-2 text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
                  <p className="text-sm font-bold text-primary">{file.name}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{(file.size / 1024).toFixed(1)} KB - Click to change</p>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined mb-2 text-3xl text-outline">cloud_upload</span>
                  <p className="text-sm font-semibold text-on-surface-variant">Drop file here or click to browse</p>
                  <p className="mt-1 text-xs text-outline">CSV or Excel - Max 5MB</p>
                </>
              )}
            </label>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => {
                  const blob = new Blob([sampleCsv], { type: 'text/csv' });
                  const anchor = document.createElement('a');
                  anchor.href = URL.createObjectURL(blob);
                  anchor.download = `${tab}_template.csv`;
                  anchor.click();
                }}
                className="flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Download Template
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">refresh</span>
                    Processing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">upload</span>
                    Upload & Process
                  </>
                )}
              </button>
            </div>

            {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-error/20 bg-error-container/30 px-4 py-3">
                <span className="material-symbols-outlined text-sm text-error">error</span>
                <p className="text-xs font-semibold text-error">{error}</p>
              </div>
            ) : null}
          </div>

          {result ? (
            <div className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                  <span className="material-symbols-outlined text-lg text-green-600">check_circle</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">{result.saved} records saved successfully</p>
                  {result.errors.length > 0 ? <p className="text-xs text-error">{result.errors.length} rows with errors</p> : null}
                </div>
              </div>

              {result.errors.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-error/10 bg-error-container/20">
                  <div className="border-b border-error/10 bg-error/5 px-4 py-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-error">Error Rows</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {['Row', 'Identifier', 'Reason'].map((heading) => (
                          <th key={heading} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((item, index) => (
                        <tr key={index} className="border-t border-error/10">
                          <td className="px-4 py-2 font-mono">{item.row}</td>
                          <td className="px-4 py-2 font-mono text-primary">{item.identifier}</td>
                          <td className="px-4 py-2 text-error">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Required Columns</h3>
            <div className="space-y-2">
              {info.columns.map((column, index) => (
                <div key={column} className="flex items-center gap-2">
                  <span className="w-4 text-[9px] font-bold text-outline">{index + 1}</span>
                  <code className={`rounded px-2 py-0.5 font-mono text-xs ${
                    column.endsWith('?') ? 'bg-surface-container text-on-surface-variant' : 'bg-primary/10 text-primary'
                  }`}>
                    {column}
                  </code>
                  {column.endsWith('?') ? <span className="text-[9px] text-outline">optional</span> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-4">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Notes</h3>
            <ul className="list-inside list-disc space-y-1.5 text-xs text-on-surface-variant">
              {tab === 'students' ? (
                <>
                  <li>Registration No: 8-digit (e.g. 23110001)</li>
                  <li>Program: B.Tech, M.Tech, MCA...</li>
                  <li>Branch: CSE, IT, EE... (code)</li>
                  <li>Auto-enrolled in matching offerings</li>
                </>
              ) : null}
              {tab === 'subjects' ? (
                <>
                  <li>Type: THEORY, LAB, ACTIVITY, ELECTIVE</li>
                  <li>branch_codes: CSE;IT or ALL</li>
                  <li>Use 3 separate int columns for L-T-P</li>
                </>
              ) : null}
              {tab === 'faculty' ? (
                <>
                  <li>Default password: 12345678</li>
                  <li>Must change password on first login</li>
                  <li>Upsert by email address</li>
                  <li>`department` is optional and does not restrict teaching assignment</li>
                </>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
