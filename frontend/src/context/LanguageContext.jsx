import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const STORAGE_KEY_LANG = 'shp_language';

/**
 * Đọc an toàn từ localStorage với cơ chế chống ném SecurityError
 */
function safeGetLang() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY_LANG);
      if (saved === 'vi' || saved === 'en') {
        return saved;
      }
    }
  } catch (err) {
    console.warn('Không thể truy cập localStorage để đọc ngôn ngữ:', err);
  }
  return 'vi';
}

/**
 * Ghi an toàn vào localStorage
 */
function safeSetLang(lang) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_LANG, lang);
      return true;
    }
  } catch (err) {
    console.warn('Không thể ghi ngôn ngữ vào localStorage:', err);
  }
  return false;
}

/**
 * Bảng ánh xạ ngược từ thông điệp tiếng Việt sang mã lỗi từ điển
 * Giúp tự động dịch khi nhận chuỗi lỗi tiếng Việt cũ hoặc từ máy chủ
 */
export const VI_MESSAGE_TO_CODE = {
  // Validation
  'Vui lòng nhập địa chỉ email.': 'val_email_required',
  'Địa chỉ email không đúng định dạng (ví dụ: user@example.com).': 'val_email_format',
  'Vui lòng nhập mật khẩu.': 'val_password_required',
  'Mật khẩu phải có độ dài tối thiểu 8 ký tự.': 'val_password_min8',
  'Mật khẩu quá dài. Vui lòng rút ngắn.': 'val_password_max72',
  'Vui lòng nhập họ và tên của bạn.': 'val_fullname_required',
  'Vui lòng nhập họ và tên.': 'val_fullname_required',
  'Họ và tên phải có tối thiểu 2 ký tự.': 'val_fullname_min2',
  'Họ và tên không được vượt quá 100 ký tự.': 'val_fullname_max100',
  'Vui lòng xác nhận lại mật khẩu.': 'val_confirm_required',
  'Mật khẩu xác nhận không khớp.': 'val_confirm_match',

  // Backend error responses
  'Email hoặc mật khẩu không chính xác.': 'INVALID_CREDENTIALS',
  'Địa chỉ email này đã được sử dụng.': 'DUPLICATE_KEY',
  'Đã tồn tại trong hệ thống.': 'DUPLICATE_KEY',
  'Quá nhiều yêu cầu. Vui lòng thử lại sau.': 'TOO_MANY_REQUESTS',
  'Thông tin đăng ký không hợp lệ.': 'VALIDATION_ERROR',
  'Email và mật khẩu là bắt buộc.': 'VALIDATION_ERROR',
  'Trường remember phải là giá trị boolean (true hoặc false).': 'VALIDATION_ERROR',
  'Không thể xác nhận hủy phiên với máy chủ. Vui lòng kiểm tra lại kết nối.': 'LOGOUT_FAILED',
  'Không thể xác nhận hủy phiên với máy chủ. Vui lòng thử lại.': 'LOGOUT_FAILED',
  'Không thể đăng xuất phiên làm việc phía máy chủ.': 'LOGOUT_FAILED',
  'Không thể kết nối đến máy chủ để kiểm tra phiên làm việc.': 'session_error_default',
  'Không thể xác thực phiên làm việc với máy chủ.': 'session_verify_failed',
  'Hết thời gian chờ kết nối máy chủ. Vui lòng kiểm tra lại dịch vụ backend.': 'TIMEOUT',
  'Hết thời gian chờ kết nối máy chủ.': 'TIMEOUT',
  'Không thể kết nối đến máy chủ. Vui lòng kiểm tra dịch vụ backend hoặc kết nối mạng.': 'NETWORK_ERROR',
  'Máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau.': 'INTERNAL_SERVER_ERROR',
  'Phản hồi không đúng định dạng JSON từ máy chủ.': 'INVALID_RESPONSE',
  'Phản hồi từ máy chủ không đúng định dạng dữ liệu (phải là đối tượng JSON).': 'INVALID_RESPONSE',

  // Storage notices
  'Bộ nhớ trình duyệt bị chặn hoặc không khả dụng. Trạng thái đang được lưu tạm trong bộ nhớ.': 'notice_storage_blocked',
  'Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.': 'notice_storage_corrupted',
  'Bộ nhớ trình duyệt không khả dụng. Thay đổi đang được lưu tạm trong phiên làm việc hiện tại.': 'notice_storage_temp',
  'Không thể lưu phiên đăng nhập vào bộ nhớ trình duyệt do quyền truy cập bị chặn. Phiên đang được duy trì trong bộ nhớ tạm.': 'notice_auth_storage_blocked'
};

/**
 * Từ điển dịch thuật tập trung VI / EN
 */
export const dictionary = {
  vi: {
    // Brand
    brand_name_part1: 'SmartHome',
    brand_name_part2: 'Privacy',
    brand_subtitle: 'Cổng Khởi Tạo & Bảo Mật Trung Tâm Nhà Thông Minh',
    system_name: 'Hệ thống quản lý quyền riêng tư',
    preview_mode: 'Xem trước giao diện',

    // Language
    lang_vi: 'VI',
    lang_en: 'EN',
    lang_switch_aria: 'Chọn ngôn ngữ giao diện',

    // Hub Status
    hub_status_online: 'Hub trực tuyến',
    hub_status_connecting: 'Đang kết nối...',
    hub_status_offline: 'Hub ngoại tuyến',
    hub_status_not_connected: 'Hub chưa kết nối',
    hub_status_aria: 'Trạng thái kết nối Hub trung tâm',

    // Device Names (5 Smart Devices)
    device_smart_door_lock: 'Khóa cửa thông minh',
    device_smart_speaker: 'Loa thông minh',
    device_window_sensor: 'Cảm biến cửa sổ',
    device_smart_plug: 'Ổ cắm thông minh',
    device_environment_sensor: 'Cảm biến môi trường',

    // Auth - Common
    email_label: 'Email',
    email_placeholder: 'Nhập email',
    password_label: 'Mật khẩu',
    password_placeholder: 'Nhập mật khẩu',
    password_show: 'Hiện mật khẩu',
    password_hide: 'Ẩn mật khẩu',
    close_notice: 'Đóng thông báo',

    // Auth - Login
    login_title: 'Đăng nhập',
    remember_me: 'Ghi nhớ đăng nhập',
    forgot_password: 'Quên mật khẩu?',
    forgot_password_notice: 'Liên hệ quản trị viên để được hỗ trợ.',
    btn_login: 'Đăng nhập',
    btn_logging_in: 'Đang đăng nhập...',
    no_account: 'Chưa có tài khoản?',
    link_register: 'Đăng ký',

    // Auth - Register
    register_title: 'Tạo tài khoản',
    fullname_label: 'Họ và tên',
    fullname_placeholder: 'Nhập họ và tên',
    password_reg_placeholder: 'Tối thiểu 8 ký tự',
    confirm_password_label: 'Xác nhận mật khẩu',
    confirm_password_placeholder: 'Nhập lại mật khẩu',
    confirm_password_show: 'Hiện xác nhận mật khẩu',
    confirm_password_hide: 'Ẩn xác nhận mật khẩu',
    btn_register: 'Tạo tài khoản',
    btn_registering: 'Đang tạo tài khoản...',
    have_account: 'Đã có tài khoản?',
    link_login: 'Đăng nhập',

    // Password strength
    strength_label: 'Độ mạnh:',
    strength_weak: 'Yếu',
    strength_medium: 'Trung bình',
    strength_good: 'Khá',
    strength_strong: 'Mạnh',

    // Register Success
    register_success_title: 'Tạo tài khoản thành công',
    register_success_desc: 'Bạn có thể đăng nhập ngay.',
    btn_go_to_login: 'Đến trang đăng nhập',

    // Validation & Error Messages
    val_email_required: 'Vui lòng nhập địa chỉ email.',
    val_email_format: 'Địa chỉ email không đúng định dạng (ví dụ: user@example.com).',
    val_password_required: 'Vui lòng nhập mật khẩu.',
    val_password_min8: 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.',
    val_password_max72: 'Mật khẩu quá dài. Vui lòng rút ngắn.',
    val_fullname_required: 'Vui lòng nhập họ và tên của bạn.',
    val_fullname_min2: 'Họ và tên phải có tối thiểu 2 ký tự.',
    val_fullname_max100: 'Họ và tên không được vượt quá 100 ký tự.',
    val_confirm_required: 'Vui lòng xác nhận lại mật khẩu.',
    val_confirm_match: 'Mật khẩu xác nhận không khớp.',
    err_duplicate_email: 'Địa chỉ email này đã được sử dụng.',
    err_register_failed: 'Không thể đăng ký tài khoản. Vui lòng kiểm tra lại thông tin.',
    err_server_connect: 'Đã xảy ra lỗi khi kết nối với máy chủ.',
    err_invalid_credentials: 'Email hoặc mật khẩu không chính xác.',

    // Backend error codes & system messages
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác.',
    DUPLICATE_KEY: 'Địa chỉ email này đã được sử dụng.',
    TOO_MANY_REQUESTS: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
    VALIDATION_ERROR: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
    UNAUTHORIZED: 'Phiên làm việc đã hết hạn hoặc không có quyền truy cập.',
    FORBIDDEN_ORIGIN: 'Yêu cầu bị từ chối do nguồn gốc không hợp lệ.',
    INVALID_JSON: 'Dữ liệu gửi lên không đúng định dạng JSON.',
    PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên vượt quá dung lượng cho phép.',
    INTERNAL_SERVER_ERROR: 'Máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau.',
    NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra dịch vụ backend hoặc mạng.',
    TIMEOUT: 'Hết thời gian chờ kết nối máy chủ.',
    INVALID_RESPONSE: 'Phản hồi từ máy chủ không đúng định dạng.',
    LOGOUT_FAILED: 'Không thể xác nhận hủy phiên với máy chủ. Vui lòng thử lại.',

    // Storage notices
    notice_storage_blocked: 'Bộ nhớ trình duyệt bị chặn hoặc không khả dụng. Trạng thái đang được lưu tạm trong bộ nhớ.',
    notice_storage_corrupted: 'Dữ liệu cấu hình trong bộ nhớ bị hỏng và đã được đặt lại về mặc định.',
    notice_storage_temp: 'Bộ nhớ trình duyệt không khả dụng. Thay đổi đang được lưu tạm trong phiên làm việc hiện tại.',
    notice_auth_storage_blocked: 'Không thể lưu phiên đăng nhập vào bộ nhớ trình duyệt do quyền truy cập bị chặn. Phiên đang được duy trì trong bộ nhớ tạm.',
    session_error_default: 'Không thể kết nối đến máy chủ để kiểm tra phiên làm việc.',
    session_verify_failed: 'Không thể xác thực phiên làm việc với máy chủ.',

    // Navigation & Sidebar
    nav_main_aria: 'Thanh điều hướng chính',
    nav_close_aria: 'Đóng thanh điều hướng',
    nav_open_aria: 'Menu điều hướng',
    nav_overview: 'Tổng quan',
    nav_smart_devices: 'Thiết bị thông minh (5)',

    // Topbar & Session
    user_role_admin: 'Quản trị viên',
    user_role_member: 'Thành viên',
    user_role_viewer: 'Khách xem',
    btn_logout: 'Đăng xuất',
    btn_logging_out: 'Đang đăng xuất...',
    err_logout_title: 'Lỗi đăng xuất:',
    err_logout_default: 'Không thể xác nhận hủy phiên với máy chủ. Vui lòng kiểm tra lại kết nối.',
    notice_storage_title: 'Lưu ý lưu trữ:',
    notice_device_config_title: 'Lưu ý cấu hình:',

    // Loading & Network Error Screens
    session_checking: 'Đang kiểm tra phiên làm việc...',
    session_loading: 'Đang tải...',
    session_error_title: 'Không thể kết nối đến máy chủ',
    btn_retry: 'Thử lại kết nối',

    // Overview Page (Rút gọn súc tích)
    overview_title: 'Tổng quan',
    overview_subtitle: 'Theo dõi và quản lý dữ liệu riêng tư của 5 thiết bị trong hệ thống.',
    overview_section_title: 'Danh sách thiết bị trong hệ thống',
    overview_owner_prefix: 'Người phụ trách:',
    overview_status_no_data: 'Chưa kết nối dữ liệu',
    overview_btn_details: 'Chi tiết & Cấu hình →',
    empty_state_title: 'Chưa kết nối dữ liệu',
    empty_state_desc: 'Hệ thống chưa nhận được dữ liệu cảm biến từ các thiết bị thông minh.',

    // Device Page
    device_not_found_title: 'Không tìm thấy thông tin thiết bị',
    btn_back_overview: 'Quay lại Trang tổng quan',
    device_id_prefix: 'ID:',
    device_owner_prefix: 'Phụ trách:',
    device_desc_template: 'Khung module độc lập cho thiết bị {name}. Cấu hình và dữ liệu chi tiết sẽ do {owner} phát triển trong thư mục module riêng.',
    device_tech_details_summary: 'Thông tin kỹ thuật (MQTT & Định danh)',
    device_mqtt_notice: 'Định dạng Topic MQTT đề xuất (chưa đối chiếu backend/firmware):',
    device_owner_section_aria: 'Khu vực của {owner}',

    // 404 Page
    not_found_code: '404',
    not_found_title: 'Không tìm thấy trang yêu cầu',
    not_found_desc: 'Đường dẫn bạn truy cập không tồn tại hoặc đã được di chuyển.'
  },
  en: {
    // Brand
    brand_name_part1: 'SmartHome',
    brand_name_part2: 'Privacy',
    brand_subtitle: 'Smart Home Central Setup & Privacy Vault',
    system_name: 'Privacy Management System',
    preview_mode: 'UI Preview',

    // Language
    lang_vi: 'VI',
    lang_en: 'EN',
    lang_switch_aria: 'Select interface language',

    // Hub Status
    hub_status_online: 'Hub Online',
    hub_status_connecting: 'Connecting...',
    hub_status_offline: 'Hub offline',
    hub_status_not_connected: 'Hub not connected',
    hub_status_aria: 'Central Hub connection status',

    // Device Names (5 Smart Devices)
    device_smart_door_lock: 'Smart Door Lock',
    device_smart_speaker: 'Smart Speaker',
    device_window_sensor: 'Window Sensor',
    device_smart_plug: 'Smart Plug',
    device_environment_sensor: 'Environment Sensor',

    // Auth - Common
    email_label: 'Email',
    email_placeholder: 'Enter email',
    password_label: 'Password',
    password_placeholder: 'Enter password',
    password_show: 'Show password',
    password_hide: 'Hide password',
    close_notice: 'Close notice',

    // Auth - Login
    login_title: 'Sign in',
    remember_me: 'Remember me',
    forgot_password: 'Forgot password?',
    forgot_password_notice: 'Please contact administrator for assistance.',
    btn_login: 'Sign in',
    btn_logging_in: 'Signing in...',
    no_account: "Don't have an account?",
    link_register: 'Sign up',

    // Auth - Register
    register_title: 'Create account',
    fullname_label: 'Full name',
    fullname_placeholder: 'Enter full name',
    password_reg_placeholder: 'At least 8 characters',
    confirm_password_label: 'Confirm password',
    confirm_password_placeholder: 'Re-enter password',
    confirm_password_show: 'Show confirm password',
    confirm_password_hide: 'Hide confirm password',
    btn_register: 'Create account',
    btn_registering: 'Creating account...',
    have_account: 'Already have an account?',
    link_login: 'Sign in',

    // Password strength
    strength_label: 'Strength:',
    strength_weak: 'Weak',
    strength_medium: 'Medium',
    strength_good: 'Good',
    strength_strong: 'Strong',

    // Register Success
    register_success_title: 'Account created successfully',
    register_success_desc: 'You can sign in right away.',
    btn_go_to_login: 'Go to sign in',

    // Validation & Error Messages
    val_email_required: 'Please enter your email address.',
    val_email_format: 'Invalid email format (e.g. user@example.com).',
    val_password_required: 'Please enter your password.',
    val_password_min8: 'Password must be at least 8 characters.',
    val_password_max72: 'Password is too long. Please shorten it.',
    val_fullname_required: 'Please enter your full name.',
    val_fullname_min2: 'Full name must be at least 2 characters.',
    val_fullname_max100: 'Full name cannot exceed 100 characters.',
    val_confirm_required: 'Please confirm your password.',
    val_confirm_match: 'Passwords do not match.',
    err_duplicate_email: 'This email address is already in use.',
    err_register_failed: 'Unable to create account. Please check your information.',
    err_server_connect: 'An error occurred while connecting to server.',
    err_invalid_credentials: 'Incorrect email or password.',

    // Backend error codes & system messages
    INVALID_CREDENTIALS: 'Incorrect email or password.',
    DUPLICATE_KEY: 'This email address is already in use.',
    TOO_MANY_REQUESTS: 'Too many requests. Please try again later.',
    VALIDATION_ERROR: 'Invalid input. Please check your information.',
    UNAUTHORIZED: 'Session expired or unauthorized access.',
    FORBIDDEN_ORIGIN: 'Request blocked due to forbidden origin.',
    INVALID_JSON: 'Invalid JSON payload sent to server.',
    PAYLOAD_TOO_LARGE: 'Payload too large.',
    INTERNAL_SERVER_ERROR: 'Internal server error. Please try again later.',
    NETWORK_ERROR: 'Cannot connect to server. Please check your connection or backend service.',
    TIMEOUT: 'Server connection timed out.',
    INVALID_RESPONSE: 'Invalid response format from server.',
    LOGOUT_FAILED: 'Unable to confirm session cancellation with server. Please try again.',

    // Storage notices
    notice_storage_blocked: 'Browser storage is blocked or unavailable. Session is temporarily saved in memory.',
    notice_storage_corrupted: 'Stored configuration data was corrupted and has been reset to defaults.',
    notice_storage_temp: 'Browser storage unavailable. Changes are temporarily kept in current session.',
    notice_auth_storage_blocked: 'Cannot persist session to browser storage due to access restrictions. Session is kept in temporary memory.',
    session_error_default: 'Cannot connect to server to verify session.',
    session_verify_failed: 'Unable to verify session with server.',

    // Navigation & Sidebar
    nav_main_aria: 'Main navigation',
    nav_close_aria: 'Close navigation',
    nav_open_aria: 'Navigation menu',
    nav_overview: 'Overview',
    nav_smart_devices: 'Smart Devices (5)',

    // Topbar & Session
    user_role_admin: 'Administrator',
    user_role_member: 'Member',
    user_role_viewer: 'Viewer',
    btn_logout: 'Sign out',
    btn_logging_out: 'Signing out...',
    err_logout_title: 'Sign out error:',
    err_logout_default: 'Unable to confirm session cancellation with server. Please check your connection.',
    notice_storage_title: 'Storage notice:',
    notice_device_config_title: 'Configuration notice:',

    // Loading & Network Error Screens
    session_checking: 'Checking active session...',
    session_loading: 'Loading...',
    session_error_title: 'Cannot connect to server',
    btn_retry: 'Retry connection',

    // Overview Page (Concise)
    overview_title: 'Overview',
    overview_subtitle: 'Monitor and manage privacy data for 5 system devices.',
    overview_section_title: 'System Devices',
    overview_owner_prefix: 'Owner:',
    overview_status_no_data: 'No data connected',
    overview_btn_details: 'Details & Config →',
    empty_state_title: 'No data connected',
    empty_state_desc: 'The system has not received sensor telemetry from smart devices yet.',

    // Device Page
    device_not_found_title: 'Device information not found',
    btn_back_overview: 'Back to Overview',
    device_id_prefix: 'ID:',
    device_owner_prefix: 'Owner:',
    device_desc_template: 'Independent module frame for {name}. Configuration and detailed data will be developed by {owner} in their dedicated module directory.',
    device_tech_details_summary: 'Technical Details (MQTT & Identifiers)',
    device_mqtt_notice: 'Proposed MQTT Topics (not verified with backend/firmware):',
    device_owner_section_aria: "{owner}'s section",

    // 404 Page
    not_found_code: '404',
    not_found_title: 'Page Not Found',
    not_found_desc: 'The page you visited does not exist or has been moved.'
  }
};

/**
 * Lấy tên hiển thị của thiết bị theo ngôn ngữ hiện tại
 * Tuyệt đối không dịch device id hoặc tên người phụ trách
 *
 * @param {string} deviceId ID thiết bị (ví dụ smart-door-lock)
 * @param {Function|string} tOrLang Hàm dịch t hoặc mã ngôn ngữ 'vi'/'en'
 * @param {string} [fallback=''] Tên dự phòng nếu không tìm thấy
 * @returns {string}
 */
export function getDeviceDisplayName(deviceId, tOrLang, fallback = '') {
  if (!deviceId) return fallback;
  const key = `device_${deviceId.replace(/-/g, '_')}`;

  if (typeof tOrLang === 'function') {
    const val = tOrLang(key);
    if (val && val !== key) return val;
  } else if (typeof tOrLang === 'string' && dictionary[tOrLang]) {
    const val = dictionary[tOrLang][key];
    if (val) return val;
  } else {
    const val = dictionary.vi[key];
    if (val) return val;
  }
  return fallback || deviceId;
}

/**
 * Chuyển đổi mã lỗi / đối tượng lỗi / chuỗi lỗi thành thông báo theo ngôn ngữ hiện tại.
 *
 * Yêu cầu quan trọng:
 * - Ở chế độ tiếng Anh (EN), ưu tiên dịch theo mã lỗi (code) hoặc ánh xạ từ điển để
 *   không hiển thị chuỗi tiếng Việt do backend trả về.
 * - Ở chế độ tiếng Việt (VI), hiển thị thông điệp cụ thể hoặc dịch theo từ điển.
 *
 * @param {any} errorDescriptor Mã lỗi, object { code, message, params } hoặc chuỗi lỗi
 * @param {Function} [t] Hàm dịch t từ useLanguage
 * @param {string} [lang] Mã ngôn ngữ ('vi' hoặc 'en')
 * @returns {string}
 */
export function getErrorMessage(errorDescriptor, t, lang) {
  if (!errorDescriptor) return '';

  const translate = typeof t === 'function' ? t : (k) => dictionary.vi[k] || k;

  // Xác định chế độ tiếng Anh: từ tham số lang, hoặc kiểm tra qua chuỗi dịch từ t
  let isEn = lang === 'en';
  if (!lang && typeof t === 'function') {
    isEn = translate('login_title') === 'Sign in';
  }

  if (typeof errorDescriptor === 'object') {
    const code = errorDescriptor.code || errorDescriptor.key;

    // Ở chế độ EN: Nếu có mã lỗi trong từ điển tiếng Anh, ưu tiên dùng tiếng Anh
    if (isEn && code && dictionary.en[code]) {
      return translate(code, errorDescriptor.params);
    }

    // Nếu có message cụ thể
    if (errorDescriptor.message) {
      if (isEn) {
        // Kiểm tra xem message tiếng Việt này có ánh xạ sang mã lỗi nào không
        const mappedCode = VI_MESSAGE_TO_CODE[errorDescriptor.message];
        if (mappedCode && dictionary.en[mappedCode]) {
          return dictionary.en[mappedCode];
        }
        if (code && dictionary.en[code]) {
          return dictionary.en[code];
        }
      }
      return errorDescriptor.message;
    }

    // Nếu không có message, dịch theo code
    if (code) {
      return translate(code, errorDescriptor.params);
    }
    return '';
  }

  if (typeof errorDescriptor === 'string') {
    if (isEn) {
      // 1. Kiểm tra nếu chuỗi là key trong từ điển tiếng Anh
      if (dictionary.en[errorDescriptor]) {
        return dictionary.en[errorDescriptor];
      }
      // 2. Kiểm tra ánh xạ từ thông điệp tiếng Việt sang tiếng Anh
      const mappedCode = VI_MESSAGE_TO_CODE[errorDescriptor];
      if (mappedCode && dictionary.en[mappedCode]) {
        return dictionary.en[mappedCode];
      }
    } else {
      if (dictionary.vi[errorDescriptor]) {
        return dictionary.vi[errorDescriptor];
      }
    }
    return errorDescriptor;
  }

  return String(errorDescriptor);
}

export const LanguageContext = createContext(null);

export function LanguageProvider({ children, initialLang = null }) {
  const [lang, setLangState] = useState(() => {
    if (initialLang === 'vi' || initialLang === 'en') {
      return initialLang;
    }
    return safeGetLang();
  });

  // Đồng bộ thuộc tính lang của document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((nextLang) => {
    if (nextLang !== 'vi' && nextLang !== 'en') return;
    setLangState(nextLang);
    safeSetLang(nextLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang;
    }
  }, []);

  const t = useCallback((key, params = {}) => {
    const activeDict = dictionary[lang] || dictionary.vi;
    let text = activeDict[key];
    if (text === undefined) {
      // Fallback về tiếng Việt nếu key chưa có trong EN
      text = dictionary.vi[key] || key;
    }

    if (typeof text === 'string' && Object.keys(params).length > 0) {
      for (const [pKey, pVal] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
      }
    }
    return text;
  }, [lang]);

  const value = {
    lang,
    language: lang,
    setLang,
    t,
    getErrorMessage: useCallback((err) => getErrorMessage(err, t, lang), [t, lang]),
    getDeviceDisplayName: useCallback((devId, fallback) => getDeviceDisplayName(devId, t, fallback), [t]),
    isVietnamese: lang === 'vi',
    isEnglish: lang === 'en'
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Trả về fallback an toàn nếu component được render ngoài LanguageProvider (ví dụ trong test cũ)
    const fallbackT = (key, params = {}) => {
      let text = dictionary.vi[key] || key;
      if (typeof text === 'string' && Object.keys(params).length > 0) {
        for (const [pKey, pVal] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
        }
      }
      return text;
    };
    return {
      lang: 'vi',
      language: 'vi',
      setLang: () => {},
      t: fallbackT,
      getErrorMessage: (err) => getErrorMessage(err, fallbackT, 'vi'),
      getDeviceDisplayName: (devId, fallback) => getDeviceDisplayName(devId, fallbackT, fallback),
      isVietnamese: true,
      isEnglish: false
    };
  }
  return ctx;
}
