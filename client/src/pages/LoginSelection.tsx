import { Link } from 'react-router-dom';
import { BrandText } from '../components/BrandText';

export function LoginSelection() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bgGray px-6">

      {/* Header */}
      <div className="text-center mb-10">
        <img src="/Edulytics.WEBP" alt="Edulytics Icon" className="mx-auto block w-[120px] h-[120px] mb-4 object-contain" />
        <h1 className="text-3xl"><BrandText /></h1>
        <p className="text-gray-400 text-sm mt-1">Select your role to continue</p>
      </div>

      {/* Cards */}
      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-2xl">

        {/* Admin Card */}
        <Link
          to="/login?type=admin"
          className="group flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-6 flex flex-col items-center text-center cursor-pointer"
        >
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
            <span className="material-symbols-outlined text-brandBlue text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>admin_panel_settings</span>
          </div>
          <h2 className="text-base font-bold text-[#3D4761] mb-1">Administrator</h2>
          <p className="text-gray-400 text-xs mb-5">Manage courses, faculty & reports</p>
          <span className="w-full py-2 px-4 bg-brandBlue text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 group-hover:bg-blue-700 transition-colors">
            Admin Login
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </span>
        </Link>

        {/* Faculty Card */}
        <Link
          to="/login?type=faculty"
          className="group flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-6 flex flex-col items-center text-center cursor-pointer"
        >
          <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
            <span className="material-symbols-outlined text-brandPurple text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>person_book</span>
          </div>
          <h2 className="text-base font-bold text-[#3D4761] mb-1">Faculty</h2>
          <p className="text-gray-400 text-xs mb-5">Enter marks & view student data</p>
          <span className="w-full py-2 px-4 bg-brandPurple text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 group-hover:bg-indigo-700 transition-colors">
            Faculty Login
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </span>
        </Link>
      </div>

      <p className="mt-8 text-gray-400 text-xs">
        Need help?{' '}
        <a href="#" className="text-gray-500 font-semibold underline underline-offset-2 hover:text-brandBlue transition-colors">Contact Support</a>
      </p>
    </div>
  );
}
