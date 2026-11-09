import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

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
  'Mật khẩu hiện tại không chính xác.': 'INCORRECT_CURRENT_PASSWORD',
  'Mật khẩu mới không được trùng với mật khẩu hiện tại.': 'PASSWORD_SAME_AS_CURRENT',
  'Thông tin xác thực đã bị thay đổi bởi một yêu cầu khác. Vui lòng thử lại.': 'AUTH_CONFLICT',
  'Thông tin xác thực của tài khoản đã thay đổi hoặc đang có thao tác xử lý khác. Vui lòng thử lại.': 'AUTH_CONFLICT',
  'Mật khẩu đã được thay đổi thành công. Do sự cố cập nhật phiên làm việc, vui lòng đăng nhập lại.': 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
  'Đổi mật khẩu thành công.': 'account_password_changed_success',
  'Chế độ xem trước không hỗ trợ đổi mật khẩu.': 'account_password_preview_notice',
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
  'Không thể tải thông báo từ máy chủ.': 'LOAD_NOTIFICATIONS_FAILED',
  'Không thể tải thêm thông báo. Vui lòng thử lại.': 'LOAD_MORE_FAILED',
  'Không thể đánh dấu đã đọc thông báo. Vui lòng thử lại.': 'MARK_READ_FAILED',
  'Không thể đánh dấu tất cả đã đọc. Vui lòng thử lại.': 'MARK_ALL_READ_FAILED',
  'Đã xử lý trên máy chủ nhưng chưa đồng bộ được hộp thư. Vui lòng thử lại.': 'SYNC_NOTIFICATIONS_FAILED',

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
    not_found_desc: 'Đường dẫn bạn truy cập không tồn tại hoặc đã được di chuyển.',

    // Settings & Navigation
    nav_settings: 'Cài đặt',
    user_menu_aria: 'Menu tài khoản',
    settings_title: 'Cài đặt hệ thống',
    settings_back_to_index: '← Cài đặt',
    settings_categories: 'Danh mục cài đặt',
    settings_cat_appearance: 'Giao diện',
    settings_cat_appearance_desc: 'Tùy chỉnh chủ đề, màu sắc, cỡ chữ, độ tương phản và định dạng ngày giờ.',
    settings_cat_account: 'Tài khoản',
    settings_cat_account_desc: 'Quản lý thông tin cá nhân và email đăng nhập.',
    settings_cat_security: 'Bảo mật',
    settings_cat_security_desc: 'Đổi mật khẩu, phiên làm việc và xác thực đa yếu tố.',
    settings_cat_notifications: 'Thông báo',
    settings_cat_notifications_desc: 'Cài đặt kênh thông báo và cảnh báo quyền riêng tư.',
    settings_cat_privacy: 'Quyền riêng tư và dữ liệu',
    settings_cat_privacy_desc: 'Kiểm soát chia sẻ dữ liệu và nhật ký truy cập.',
    settings_cat_admin: 'Quản trị',
    settings_cat_admin_desc: 'Khu vực quản trị hệ thống và người dùng (chỉ dành cho Admin).',
    settings_cat_help: 'Trợ giúp',
    settings_cat_help_desc: 'Tài liệu hướng dẫn và liên hệ hỗ trợ kỹ thuật.',
    settings_placeholder_desc: 'Chưa hỗ trợ',
    settings_admin_forbidden: 'Không có quyền truy cập khu vực quản trị.',

    // Appearance Settings
    appearance_group_display: 'Hiển thị',
    appearance_group_accessibility: 'Trợ năng',
    appearance_group_datetime: 'Thời gian',
    appearance_theme: 'Chủ đề giao diện',
    appearance_theme_dark: 'Tối',
    appearance_theme_light: 'Sáng',
    appearance_theme_system: 'Theo hệ thống',
    appearance_language: 'Ngôn ngữ hiển thị',
    appearance_language_vi: 'Tiếng Việt',
    appearance_language_en: 'English',
    appearance_fontsize: 'Cỡ chữ',
    appearance_fontsize_small: 'Nhỏ',
    appearance_fontsize_medium: 'Vừa',
    appearance_fontsize_large: 'Lớn',
    appearance_contrast: 'Độ tương phản cao',
    appearance_contrast_desc: 'Tăng độ tương phản của chữ, đường viền và tiêu điểm để dễ quan sát hơn.',
    appearance_motion: 'Giảm chuyển động',
    appearance_motion_desc: 'Hạn chế hoặc tắt các hiệu ứng chuyển động và nhấp nháy trên toàn giao diện.',
    appearance_timezone: 'Múi giờ',
    appearance_timezone_detect: 'Nhận diện theo máy',
    appearance_timezone_search_placeholder: 'Tìm múi giờ IANA...',
    appearance_timezone_invalid: 'Múi giờ không hợp lệ.',
    appearance_dateformat: 'Định dạng ngày',
    appearance_dateformat_dmy: 'Ngày/tháng/năm — 27/10/2026',
    appearance_dateformat_ymd: 'Năm-tháng-ngày — 2026-10-27',
    appearance_dateformat_mdy: 'Tháng/ngày/năm — 10/27/2026',
    appearance_hourformat: 'Định dạng giờ',
    appearance_hourformat_24h: '24 giờ (14:30)',
    appearance_hourformat_12h: '12 giờ (02:30 CH)',

    // Appearance Preview
    appearance_preview_title: 'Xem trước',
    appearance_preview_subtitle: 'Minh họa các lựa chọn giao diện đang được áp dụng',
    appearance_preview_sample_card: 'Thẻ mẫu',
    appearance_preview_sample_desc: 'Xem màu sắc và cỡ chữ đã chọn.',
    appearance_preview_sample_badge: 'Hoạt động',
    appearance_preview_sample_btn: 'Nút mẫu',
    appearance_preview_disclaimer: 'Nội dung minh họa.',

    // Settings Save Status
    settings_status_loading: 'Đang tải cài đặt...',
    settings_status_load_error: 'Không thể tải cài đặt từ máy chủ.',
    settings_load_error_desc: 'Chưa thể tải dữ liệu đã lưu. Vui lòng thử lại trước khi chỉnh sửa.',
    settings_status_saving: 'Đang lưu...',
    settings_status_saved: 'Đã lưu',
    settings_status_error: 'Chưa xác nhận lưu được. Thử lại.',
    settings_btn_retry: 'Thử lại',
    settings_preview_notice: 'Đang ở chế độ xem trước. Cần đăng nhập tài khoản thật để lưu cài đặt.',

    // Backend Settings Error Codes
    EMPTY_UPDATE_BODY: 'Dữ liệu cập nhật không được để trống.',
    UNKNOWN_FIELD_REJECTED: 'Chứa trường không được phép trong cài đặt.',
    INVALID_FIELD_TYPE: 'Kiểu dữ liệu cài đặt không hợp lệ.',
    INVALID_ENUM_VALUE: 'Giá trị lựa chọn không nằm trong danh mục cho phép.',
    INVALID_TIMEZONE: 'Múi giờ không hợp lệ hoặc không được hỗ trợ.',
    CHANNEL_NOT_AVAILABLE: 'Kênh thông báo email hiện chưa khả dụng.',
    INVALID_FIELD_VALUE: 'Giá trị trường không hợp lệ.',

    // Notification Settings
    notif_title: 'Cài đặt thông báo',
    notif_subtitle: 'Cấu hình cách thức và thời điểm nhận cảnh báo quyền riêng tư.',
    notif_disclaimer_note: 'Hiện chỉ lưu lựa chọn; tính năng gửi thông báo đang được hoàn thiện.',
    notif_group_types: 'Loại thông báo',
    notif_type_unusual_access: 'Truy cập bất thường',
    notif_type_unusual_access_desc: 'Cảnh báo khi có phiên đăng nhập lạ hoặc hoạt động bất thường.',
    notif_type_device_disconnected: 'Thiết bị mất kết nối',
    notif_type_device_disconnected_desc: 'Thông báo khi thiết bị ngoại vi ngừng phản hồi hoặc mất kết nối mạng.',
    notif_type_permission_changes: 'Thay đổi quyền',
    notif_type_permission_changes_desc: 'Thông báo khi vai trò người dùng hoặc quyền truy cập được cập nhật.',
    notif_type_monthly_report: 'Báo cáo hàng tháng',
    notif_type_monthly_report_desc: 'Tổng hợp điểm minh bạch và hoạt động thiết bị định kỳ mỗi tháng.',
    notif_group_severity: 'Mức độ nhận',
    notif_severity_urgent: 'Chỉ khẩn cấp',
    notif_severity_urgent_desc: 'Chỉ nhận cảnh báo có mức độ nghiêm trọng cao nhất.',
    notif_severity_warning: 'Từ mức chú ý trở lên',
    notif_severity_warning_desc: 'Mặc định: bao gồm cảnh báo cần chú ý và khẩn cấp.',
    notif_severity_all: 'Tất cả thông báo',
    notif_severity_all_desc: 'Bao gồm tất cả sự kiện, thông tin và cập nhật trạng thái.',
    notif_group_quiet_hours: 'Giờ không làm phiền',
    notif_quiet_hours_enable: 'Bật giờ không làm phiền',
    notif_quiet_hours_enable_desc: 'Tắt âm báo và thông báo đẩy trong khung giờ đã chọn.',
    notif_quiet_hours_start: 'Giờ bắt đầu',
    notif_quiet_hours_end: 'Giờ kết thúc',
    notif_quiet_hours_timezone: 'Múi giờ tham chiếu',
    notif_quiet_hours_same_time_hint: 'Giờ không làm phiền không có hiệu lực',
    notif_quiet_hours_urgent_bypass: 'Cảnh báo khẩn cấp luôn được phép',
    notif_time_invalid: 'Định dạng giờ không hợp lệ (HH:mm từ 00:00 đến 23:59).',
    notif_group_channels: 'Kênh nhận',
    notif_channel_web: 'Trên web',
    notif_channel_web_desc: 'Nhận thông báo trực tiếp trên bảng điều khiển web.',
    notif_channel_email: 'Email',
    notif_channel_email_desc: 'Gửi cảnh báo tới hộp thư điện tử của bạn.',
    notif_channel_unavailable: 'Chưa khả dụng',
    notif_status_loading: 'Đang tải cài đặt thông báo...',
    notif_status_saving: 'Đang lưu...',
    notif_status_saved: 'Đã lưu',
    notif_status_error: 'Chưa xác nhận lưu được.',
    notif_status_retry: 'Thử lại',
    notif_load_error_desc: 'Chưa thể tải dữ liệu thông báo từ máy chủ. Vui lòng thử lại trước khi chỉnh sửa.',
    notif_preview_notice: 'Đang ở chế độ xem trước. Cần đăng nhập tài khoản thật để lưu cài đặt thông báo.',

    // Notification Inbox & Bell (Phase 4D.2)
    nav_notifications_inbox: 'Thông báo',
    notif_bell_aria: 'Thông báo',
    notif_bell_aria_count: 'Thông báo, {count} chưa đọc',
    notif_dropdown_title: 'Thông báo',
    notif_btn_view_all: 'Xem tất cả',
    notif_empty_title: 'Chưa có thông báo nào',
    notif_empty_desc: 'Bạn đã cập nhật mọi thông tin mới nhất.',
    notif_loading: 'Đang tải thông báo...',
    notif_load_error: 'Không thể tải thông báo từ máy chủ.',
    notif_btn_retry: 'Thử lại',
    notif_page_title: 'Thông báo',
    notif_page_subtitle: 'Theo dõi các thông báo bảo mật và hoạt động hệ thống.',
    notif_btn_refresh: 'Làm mới',
    notif_btn_mark_all_read: 'Đánh dấu tất cả đã đọc',
    notif_btn_mark_read: 'Đánh dấu đã đọc',
    notif_btn_load_more: 'Tải thêm',
    notif_btn_loading_more: 'Đang tải thêm...',
    notif_status_read: 'Đã đọc',
    notif_status_unread: 'Chưa đọc',
    notif_time_read_at: 'Đọc lúc:',
    notif_badge_info: 'Thông tin',
    notif_badge_warning: 'Chú ý',
    notif_badge_urgent: 'Khẩn cấp',
    notif_event_session_revoked_title: 'Phiên đăng nhập đã bị thu hồi',
    notif_event_session_revoked_desc: 'Quyền truy cập của một phiên đăng nhập đã được thu hồi.',
    notif_device_label: 'Thiết bị:',
    notif_browser_label: 'Trình duyệt:',
    notif_unknown_device: 'Thiết bị không xác định',
    notif_unknown_browser: 'Trình duyệt không xác định',
    notif_event_fallback_title: 'Thông báo hệ thống',
    notif_event_fallback_desc: 'Một sự kiện hệ thống đã phát sinh.',
    notif_btn_close_error: 'Đóng thông báo lỗi',
    LOAD_NOTIFICATIONS_FAILED: 'Không thể tải thông báo từ máy chủ.',
    LOAD_MORE_FAILED: 'Không thể tải thêm thông báo. Vui lòng thử lại.',
    MARK_READ_FAILED: 'Không thể đánh dấu đã đọc thông báo. Vui lòng thử lại.',
    MARK_ALL_READ_FAILED: 'Không thể đánh dấu tất cả đã đọc. Vui lòng thử lại.',
    SYNC_NOTIFICATIONS_FAILED: 'Đã xử lý trên máy chủ nhưng chưa đồng bộ được hộp thư. Vui lòng thử lại.',

    // Account Settings
    account_title: 'Hồ sơ tài khoản',
    account_subtitle: 'Xem và quản lý thông tin tài khoản đăng nhập của bạn.',
    account_identity_title: 'Nhận diện tài khoản',
    account_personal_info: 'Thông tin cá nhân',
    account_permissions_title: 'Quyền hạn và Phân công',
    account_fullname_label: 'Họ và tên',
    account_fullname_placeholder: 'Nhập họ và tên...',
    account_email_label: 'Địa chỉ Email',
    account_email_caption: 'Email đăng nhập',
    account_role_label: 'Vai trò hiện tại',
    account_assigned_devices: 'Thiết bị phụ trách',
    account_no_devices: 'Bạn chưa được phân công thiết bị.',
    account_status_saving: 'Đang lưu...',
    account_status_saved: 'Đã lưu.',
    account_status_error: 'Chưa lưu được. Thử lại.',
    account_btn_retry: 'Thử lại',
    account_readonly_badge: 'Chỉ đọc',
    account_preview_notice: 'Chế độ xem trước: Không thể chỉnh sửa hồ sơ tài khoản.',
    account_device_view: 'Xem thiết bị →',
    account_unrecognized_device: 'Thiết bị không xác định',

    // Password & Change Password Dialog
    account_password_card_title: 'Mật khẩu',
    account_password_card_desc: 'Cập nhật mật khẩu đăng nhập.',
    account_btn_change_password: 'Đổi mật khẩu',
    account_password_changed_success: 'Đổi mật khẩu thành công.',
    account_password_preview_notice: 'Chế độ xem trước: Vui lòng đăng nhập tài khoản thật để đổi mật khẩu.',
    dialog_change_password_title: 'Đổi mật khẩu',
    dialog_close: 'Đóng hộp thoại',
    field_current_password: 'Mật khẩu hiện tại',
    field_current_password_placeholder: 'Nhập mật khẩu hiện tại',
    field_new_password: 'Mật khẩu mới',
    field_new_password_placeholder: 'Tối thiểu 8 ký tự',
    field_confirm_password: 'Xác nhận mật khẩu mới',
    field_confirm_password_placeholder: 'Nhập lại mật khẩu mới',
    show_current_password: 'Hiện mật khẩu hiện tại',
    hide_current_password: 'Ẩn mật khẩu hiện tại',
    show_new_password: 'Hiện mật khẩu mới',
    hide_new_password: 'Ẩn mật khẩu mới',
    show_confirm_password: 'Hiện xác nhận mật khẩu',
    hide_confirm_password: 'Ẩn xác nhận mật khẩu',
    change_password_session_notice: 'Các phiên đăng nhập khác sẽ bị đăng xuất.',
    btn_cancel: 'Hủy',
    btn_submit_change_password: 'Đổi mật khẩu',
    btn_submitting_change_password: 'Đang đổi...',
    val_current_password_required: 'Vui lòng nhập mật khẩu hiện tại.',
    val_new_password_required: 'Vui lòng nhập mật khẩu mới.',
    val_password_max72_bytes: 'Mật khẩu không được vượt quá 72 byte UTF-8.',
    val_password_same_as_current: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
    INCORRECT_CURRENT_PASSWORD: 'Mật khẩu hiện tại không chính xác.',
    PASSWORD_SAME_AS_CURRENT: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
    AUTH_CONFLICT: 'Thông tin xác thực đã thay đổi hoặc đang có thao tác khác. Vui lòng đăng nhập lại.',
    PASSWORD_CHANGED_RELOGIN_REQUIRED: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    password_changed_relogin: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    change_password_indeterminate_warning: 'Chưa xác định được kết quả do gián đoạn kết nối. Vui lòng đăng nhập lại để xác minh trước khi thử lại.',

    // Security & Session Management (Phase 3B)
    security_title: 'Bảo mật',
    security_page_desc: 'Quản lý các phiên đăng nhập và bảo mật tài khoản.',
    security_sessions_title: 'Phiên đăng nhập',
    security_sessions_desc: 'Danh sách các thiết bị và trình duyệt đang đăng nhập vào tài khoản của bạn.',
    security_btn_refresh: 'Làm mới',
    security_btn_refreshing: 'Đang làm mới...',
    security_btn_logout_all: 'Đăng xuất mọi nơi',
    security_btn_revoke: 'Đăng xuất',
    security_btn_revoking: 'Đang xử lý...',
    security_badge_current: 'Phiên hiện tại',
    security_last_active: 'Hoạt động gần nhất:',
    security_created_at: 'Đăng nhập lúc:',
    security_no_created_at: 'Không có thông tin',
    security_unknown_device: 'Thiết bị không xác định',
    security_unknown_browser: 'Trình duyệt không xác định',
    security_loading_sessions: 'Đang tải danh sách phiên...',
    security_empty_sessions: 'Chưa có dữ liệu phiên',
    security_load_error: 'Không thể tải danh sách phiên làm việc.',
    security_refresh_error: 'Chưa cập nhật được danh sách phiên mới nhất.',
    security_btn_retry: 'Thử lại',
    security_preview_notice: 'Cần đăng nhập để quản lý phiên',
    security_session_already_revoked: 'Phiên không còn hoạt động hoặc đã hết hạn.',
    security_revoke_success: 'Đã đăng xuất phiên làm việc thành công.',
    security_logout_all_success: 'Đã đăng xuất khỏi tất cả các thiết bị thành công.',
    security_revoke_dialog_title: 'Đăng xuất phiên làm việc',
    security_revoke_dialog_desc: 'Bạn có chắc chắn muốn đăng xuất phiên làm việc này không?',
    security_revoke_dialog_current_warning: 'Bạn đang chọn đăng xuất chính phiên hiện tại. Bạn sẽ phải đăng nhập lại trên thiết bị này.',
    security_revoke_dialog_btn_confirm: 'Đăng xuất phiên',
    security_logout_all_dialog_title: 'Đăng xuất khỏi tất cả thiết bị',
    security_logout_all_dialog_desc: 'Hành động này sẽ hủy tất cả các phiên đăng nhập đang hoạt động của bạn, bao gồm cả phiên trên thiết bị này. Bạn sẽ cần đăng nhập lại trên tất cả các thiết bị.',
    security_logout_all_dialog_btn_confirm: 'Đăng xuất tất cả',
    security_action_conflict: 'Đang có một thao tác khác được thực hiện. Vui lòng chờ.',
    security_network_error: 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.',
    security_invalid_response: 'Phản hồi từ máy chủ không hợp lệ.',
    security_indeterminate_result: 'Chưa thể xác nhận kết quả thao tác. Vui lòng làm mới để kiểm tra.',
    SESSION_NOT_FOUND: 'Phiên không còn hoạt động hoặc đã hết hạn.',

    // Privacy Settings (Phase 5B)
    privacy_title: 'Quyền riêng tư và dữ liệu',
    privacy_subtitle: 'Quản lý thời gian lưu giữ dữ liệu và các tùy chọn quyền riêng tư.',
    privacy_retention_card_title: 'Thời gian lưu giữ',
    privacy_retention_card_desc: 'Tự động dọn dẹp các mục lưu trữ sau khoảng thời gian đã chọn.',
    privacy_retention_7d: '7 ngày',
    privacy_retention_30d: '30 ngày (Khuyến nghị)',
    privacy_retention_90d: '90 ngày',
    privacy_retention_disclaimer: 'Hiện chỉ lưu lựa chọn. Chức năng tự dọn dữ liệu chưa được bật.',
    privacy_status_loading: 'Đang tải cài đặt...',
    privacy_status_saving: 'Đang lưu...',
    privacy_status_saved: 'Đã lưu',
    privacy_status_error: 'Không lưu được',
    privacy_status_load_error: 'Không thể tải cài đặt quyền riêng tư',
    privacy_btn_retry: 'Thử lại',
    privacy_preview_notice: 'Chế độ xem trước — Thay đổi không được lưu vào máy chủ',
    privacy_future_export_title: 'Tải dữ liệu của tôi',
    privacy_future_export_status: 'Chưa khả dụng',
    privacy_future_export_desc: 'Tính năng xuất dữ liệu theo định dạng CSV / PDF sẽ được cung cấp ở giai đoạn tiếp theo.',
    privacy_future_consents_title: 'Các sự đồng ý đã cấp',
    privacy_future_consents_status: 'Chưa khả dụng',
    privacy_future_consents_desc: 'Quản lý các quyền chia sẻ dữ liệu và đo kiểm thiết bị.',
    privacy_future_delete_title: 'Xóa dữ liệu của tôi',
    privacy_future_delete_status: 'Chưa khả dụng',
    privacy_future_delete_desc: 'Khu vực nguy hiểm để xóa dữ liệu cá nhân có xác nhận mật khẩu.'
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
    not_found_desc: 'The page you visited does not exist or has been moved.',

    // Settings & Navigation
    nav_settings: 'Settings',
    user_menu_aria: 'User account menu',
    settings_title: 'System Settings',
    settings_back_to_index: '← Settings',
    settings_categories: 'Settings Categories',
    settings_cat_appearance: 'Appearance',
    settings_cat_appearance_desc: 'Customize theme, colors, font size, contrast, and date/time format.',
    settings_cat_account: 'Account',
    settings_cat_account_desc: 'Manage your profile and login email.',
    settings_cat_security: 'Security',
    settings_cat_security_desc: 'Change password, manage sessions and two-factor authentication.',
    settings_cat_notifications: 'Notifications',
    settings_cat_notifications_desc: 'Configure alert channels and privacy notifications.',
    settings_cat_privacy: 'Privacy & Data',
    settings_cat_privacy_desc: 'Control data telemetry sharing and access logs.',
    settings_cat_admin: 'Administration',
    settings_cat_admin_desc: 'Manage system settings and user accounts (Admin only).',
    settings_cat_help: 'Help',
    settings_cat_help_desc: 'Documentation, guides, and technical support.',
    settings_placeholder_desc: 'Not available yet',
    settings_admin_forbidden: 'Access denied. Administrator privileges required.',

    // Appearance Settings
    appearance_group_display: 'Display',
    appearance_group_accessibility: 'Accessibility',
    appearance_group_datetime: 'Date & Time',
    appearance_theme: 'Theme',
    appearance_theme_dark: 'Dark',
    appearance_theme_light: 'Light',
    appearance_theme_system: 'System',
    appearance_language: 'Display Language',
    appearance_language_vi: 'Tiếng Việt',
    appearance_language_en: 'English',
    appearance_fontsize: 'Font Size',
    appearance_fontsize_small: 'Small',
    appearance_fontsize_medium: 'Medium',
    appearance_fontsize_large: 'Large',
    appearance_contrast: 'High Contrast',
    appearance_contrast_desc: 'Increase contrast for text, borders, and focus rings for better visibility.',
    appearance_motion: 'Reduced Motion',
    appearance_motion_desc: 'Limit or disable animations, transitions, and pulsing effects across the dashboard.',
    appearance_timezone: 'Time Zone',
    appearance_timezone_detect: 'Detect from device',
    appearance_timezone_search_placeholder: 'Search IANA time zone...',
    appearance_timezone_invalid: 'Invalid time zone.',
    appearance_dateformat: 'Date Format',
    appearance_dateformat_dmy: 'Day/Month/Year — 27/10/2026',
    appearance_dateformat_ymd: 'Year-Month-Day — 2026-10-27',
    appearance_dateformat_mdy: 'Month/Day/Year — 10/27/2026',
    appearance_hourformat: 'Hour Format',
    appearance_hourformat_24h: '24-hour (14:30)',
    appearance_hourformat_12h: '12-hour (02:30 PM)',

    // Appearance Preview
    appearance_preview_title: 'Preview',
    appearance_preview_subtitle: 'Preview of current appearance choices',
    appearance_preview_sample_card: 'Sample Card',
    appearance_preview_sample_desc: 'Preview your chosen colors and font size.',
    appearance_preview_sample_badge: 'Active',
    appearance_preview_sample_btn: 'Sample Button',
    appearance_preview_disclaimer: 'Illustrative content.',

    // Settings Save Status
    settings_status_loading: 'Loading settings...',
    settings_status_load_error: 'Failed to load settings from server.',
    settings_load_error_desc: 'Could not load saved data. Please retry before editing.',
    settings_status_saving: 'Saving changes...',
    settings_status_saved: 'Saved',
    settings_status_error: 'Could not confirm save. Retry.',
    settings_btn_retry: 'Retry',
    settings_preview_notice: 'Preview mode active. Login with a real account to save settings.',

    // Backend Settings Error Codes
    EMPTY_UPDATE_BODY: 'Update data cannot be empty.',
    UNKNOWN_FIELD_REJECTED: 'Contains invalid or forbidden setting field.',
    INVALID_FIELD_TYPE: 'Invalid field data type.',
    INVALID_ENUM_VALUE: 'Selected value is not in the allowed list.',
    INVALID_TIMEZONE: 'Invalid or unsupported time zone.',
    CHANNEL_NOT_AVAILABLE: 'Email notification channel is currently unavailable.',
    INVALID_FIELD_VALUE: 'Invalid field value.',

    // Notification Settings
    notif_title: 'Notification Settings',
    notif_subtitle: 'Configure how and when you receive privacy alerts.',
    notif_disclaimer_note: 'Currently saving preferences only; notification dispatching is under development.',
    notif_group_types: 'Notification Types',
    notif_type_unusual_access: 'Unusual Access',
    notif_type_unusual_access_desc: 'Alert when unfamiliar login or suspicious activity occurs.',
    notif_type_device_disconnected: 'Device Disconnected',
    notif_type_device_disconnected_desc: 'Notify when a peripheral device loses connection or stops responding.',
    notif_type_permission_changes: 'Permission Changes',
    notif_type_permission_changes_desc: 'Notify when user roles or access privileges are modified.',
    notif_type_monthly_report: 'Monthly Report',
    notif_type_monthly_report_desc: 'Periodic monthly summary of privacy metrics and device activities.',
    notif_group_severity: 'Severity Level',
    notif_severity_urgent: 'Urgent only',
    notif_severity_urgent_desc: 'Receive only critical security alerts.',
    notif_severity_warning: 'Warning and above',
    notif_severity_warning_desc: 'Default: includes both warning and urgent alerts.',
    notif_severity_all: 'All notifications',
    notif_severity_all_desc: 'Includes all events, info, and status updates.',
    notif_group_quiet_hours: 'Quiet Hours',
    notif_quiet_hours_enable: 'Enable quiet hours',
    notif_quiet_hours_enable_desc: 'Mute sounds and push banners during specified hours.',
    notif_quiet_hours_start: 'Start time',
    notif_quiet_hours_end: 'End time',
    notif_quiet_hours_timezone: 'Reference time zone',
    notif_quiet_hours_same_time_hint: 'Quiet hours have no effect',
    notif_quiet_hours_urgent_bypass: 'Urgent alerts are always allowed',
    notif_time_invalid: 'Invalid time format (HH:mm from 00:00 to 23:59).',
    notif_group_channels: 'Delivery Channels',
    notif_channel_web: 'In-app Web',
    notif_channel_web_desc: 'Receive alerts directly within web dashboard.',
    notif_channel_email: 'Email',
    notif_channel_email_desc: 'Send alerts to your registered email address.',
    notif_channel_unavailable: 'Unavailable',
    notif_status_loading: 'Loading notification settings...',
    notif_status_saving: 'Saving changes...',
    notif_status_saved: 'Saved',
    notif_status_error: 'Could not confirm save.',
    notif_status_retry: 'Retry',
    notif_load_error_desc: 'Failed to load notification settings from server. Please retry before editing.',
    notif_preview_notice: 'Preview mode active. Log in with a real account to save notification preferences.',

    // Notification Inbox & Bell (Phase 4D.2)
    nav_notifications_inbox: 'Notifications',
    notif_bell_aria: 'Notifications',
    notif_bell_aria_count: 'Notifications, {count} unread',
    notif_dropdown_title: 'Notifications',
    notif_btn_view_all: 'View all',
    notif_empty_title: 'No notifications',
    notif_empty_desc: 'You are all caught up.',
    notif_loading: 'Loading notifications...',
    notif_load_error: 'Failed to load notifications from server.',
    notif_btn_retry: 'Retry',
    notif_page_title: 'Notifications',
    notif_page_subtitle: 'Monitor security notifications and system activity.',
    notif_btn_refresh: 'Refresh',
    notif_btn_mark_all_read: 'Mark all as read',
    notif_btn_mark_read: 'Mark as read',
    notif_btn_load_more: 'Load more',
    notif_btn_loading_more: 'Loading more...',
    notif_status_read: 'Read',
    notif_status_unread: 'Unread',
    notif_time_read_at: 'Read at:',
    notif_badge_info: 'Info',
    notif_badge_warning: 'Warning',
    notif_badge_urgent: 'Urgent',
    notif_event_session_revoked_title: 'Session revoked',
    notif_event_session_revoked_desc: 'Access for a login session has been revoked.',
    notif_device_label: 'Device:',
    notif_browser_label: 'Browser:',
    notif_unknown_device: 'Unknown device',
    notif_unknown_browser: 'Unknown browser',
    notif_event_fallback_title: 'System notification',
    notif_event_fallback_desc: 'A system event has occurred.',
    notif_btn_close_error: 'Dismiss error notice',
    LOAD_NOTIFICATIONS_FAILED: 'Failed to load notifications from server.',
    LOAD_MORE_FAILED: 'Failed to load more notifications. Please try again.',
    MARK_READ_FAILED: 'Failed to mark notification as read. Please try again.',
    MARK_ALL_READ_FAILED: 'Failed to mark all as read. Please try again.',
    SYNC_NOTIFICATIONS_FAILED: 'Processed on server, but failed to sync notifications. Please try again.',

    // Account Settings
    account_title: 'Account Profile',
    account_subtitle: 'View and manage your login account profile.',
    account_identity_title: 'Account Identity',
    account_personal_info: 'Personal Information',
    account_permissions_title: 'Permissions & Assignments',
    account_fullname_label: 'Full Name',
    account_fullname_placeholder: 'Enter full name...',
    account_email_label: 'Email Address',
    account_email_caption: 'Login email',
    account_role_label: 'Current Role',
    account_assigned_devices: 'Assigned Devices',
    account_no_devices: 'You have no assigned devices.',
    account_status_saving: 'Saving...',
    account_status_saved: 'Saved.',
    account_status_error: 'Save failed. Try again.',
    account_btn_retry: 'Retry',
    account_readonly_badge: 'Read-only',
    account_preview_notice: 'Preview mode: Account profile cannot be edited.',
    account_device_view: 'View device →',
    account_unrecognized_device: 'Unrecognized Device',

    // Password & Change Password Dialog
    account_password_card_title: 'Password',
    account_password_card_desc: 'Update your sign-in password.',
    account_btn_change_password: 'Change password',
    account_password_changed_success: 'Password changed successfully.',
    account_password_preview_notice: 'Preview mode: Please sign in with a real account to change password.',
    dialog_change_password_title: 'Change Password',
    dialog_close: 'Close dialog',
    field_current_password: 'Current password',
    field_current_password_placeholder: 'Enter current password',
    field_new_password: 'New password',
    field_new_password_placeholder: 'At least 8 characters',
    field_confirm_password: 'Confirm new password',
    field_confirm_password_placeholder: 'Re-enter new password',
    show_current_password: 'Show current password',
    hide_current_password: 'Hide current password',
    show_new_password: 'Show new password',
    hide_new_password: 'Hide new password',
    show_confirm_password: 'Show confirm password',
    hide_confirm_password: 'Hide confirm password',
    change_password_session_notice: 'Other active sessions will be logged out.',
    btn_cancel: 'Cancel',
    btn_submit_change_password: 'Change password',
    btn_submitting_change_password: 'Changing...',
    val_current_password_required: 'Please enter your current password.',
    val_new_password_required: 'Please enter your new password.',
    val_password_max72_bytes: 'Password cannot exceed 72 UTF-8 bytes.',
    val_password_same_as_current: 'New password cannot be the same as current password.',
    INCORRECT_CURRENT_PASSWORD: 'Current password is incorrect.',
    PASSWORD_SAME_AS_CURRENT: 'New password cannot be the same as current password.',
    AUTH_CONFLICT: 'Credentials have changed or another operation occurred. Please sign in again.',
    PASSWORD_CHANGED_RELOGIN_REQUIRED: 'Password changed successfully. Please sign in again with your new password.',
    password_changed_relogin: 'Password changed successfully. Please sign in again with your new password.',
    change_password_indeterminate_warning: 'Result undetermined due to connection disruption. Please verify by signing in again before retrying.',

    // Security & Session Management (Phase 3B)
    security_title: 'Security',
    security_page_desc: 'Manage active login sessions and account security.',
    security_sessions_title: 'Active Sessions',
    security_sessions_desc: 'List of devices and browsers currently logged into your account.',
    security_btn_refresh: 'Refresh',
    security_btn_refreshing: 'Refreshing...',
    security_btn_logout_all: 'Log out of all devices',
    security_btn_revoke: 'Log out',
    security_btn_revoking: 'Processing...',
    security_badge_current: 'Current session',
    security_last_active: 'Last active:',
    security_created_at: 'Logged in at:',
    security_no_created_at: 'No information',
    security_unknown_device: 'Unknown device',
    security_unknown_browser: 'Unknown browser',
    security_loading_sessions: 'Loading sessions...',
    security_empty_sessions: 'No session data available',
    security_load_error: 'Unable to load active sessions.',
    security_refresh_error: 'Failed to update session list.',
    security_btn_retry: 'Retry',
    security_preview_notice: 'Login required to manage sessions',
    security_session_already_revoked: 'Session is no longer active or has expired.',
    security_revoke_success: 'Session logged out successfully.',
    security_logout_all_success: 'Logged out from all devices successfully.',
    security_revoke_dialog_title: 'Log Out Session',
    security_revoke_dialog_desc: 'Are you sure you want to log out this session?',
    security_revoke_dialog_current_warning: 'You are logging out your current session. You will need to log in again on this device.',
    security_revoke_dialog_btn_confirm: 'Log Out Session',
    security_logout_all_dialog_title: 'Log Out of All Devices',
    security_logout_all_dialog_desc: 'This will revoke all active sessions across all devices, including this one. You will need to log in again on all devices.',
    security_logout_all_dialog_btn_confirm: 'Log Out All',
    security_action_conflict: 'Another action is in progress. Please wait.',
    security_network_error: 'Cannot connect to server. Please check your network connection.',
    security_invalid_response: 'Invalid response received from server.',
    security_indeterminate_result: 'Could not verify action outcome. Please refresh to check.',
    SESSION_NOT_FOUND: 'Session is no longer active or has expired.',

    // Privacy Settings (Phase 5B)
    privacy_title: 'Privacy & Data',
    privacy_subtitle: 'Manage data retention period and privacy preferences.',
    privacy_retention_card_title: 'Data Retention Period',
    privacy_retention_card_desc: 'Automatically clean stored items after the selected duration.',
    privacy_retention_7d: '7 days',
    privacy_retention_30d: '30 days (Recommended)',
    privacy_retention_90d: '90 days',
    privacy_retention_disclaimer: 'Currently only saves your preference. Automatic data cleanup is not yet enabled.',
    privacy_status_loading: 'Loading settings...',
    privacy_status_saving: 'Saving...',
    privacy_status_saved: 'Saved',
    privacy_status_error: 'Failed to save',
    privacy_status_load_error: 'Failed to load privacy settings',
    privacy_btn_retry: 'Retry',
    privacy_preview_notice: 'Preview mode — Changes are not saved to server',
    privacy_future_export_title: 'Download My Data',
    privacy_future_export_status: 'Not available yet',
    privacy_future_export_desc: 'Data export in CSV / PDF format will be available in the next phase.',
    privacy_future_consents_title: 'Granted Consents',
    privacy_future_consents_status: 'Not available yet',
    privacy_future_consents_desc: 'Manage data sharing and device telemetry permissions.',
    privacy_future_delete_title: 'Delete My Data',
    privacy_future_delete_status: 'Not available yet',
    privacy_future_delete_desc: 'Danger zone to permanently delete personal data with password confirmation.'
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

  const languageChangeListenerRef = useRef(null);
  const currentLangRef = useRef(initialLang);
  currentLangRef.current = lang;

  const registerLanguageChangeListener = useCallback((listener) => {
    languageChangeListenerRef.current = listener;
    return () => {
      if (languageChangeListenerRef.current === listener) {
        languageChangeListenerRef.current = null;
      }
    };
  }, []);

  const setLang = useCallback((nextLang, options = {}) => {
    if (nextLang !== 'vi' && nextLang !== 'en') return;
    const isChanged = nextLang !== currentLangRef.current;
    currentLangRef.current = nextLang;
    setLangState(nextLang);
    safeSetLang(nextLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang;
    }
    // Chỉ kích hoạt callback nếu có thay đổi thực tế, không phải là hydration từ server và không phải gọi từ SettingsContext
    if (isChanged && !options.isHydration && !options.fromSettings && typeof languageChangeListenerRef.current === 'function') {
      languageChangeListenerRef.current(nextLang);
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
    registerLanguageChangeListener,
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
      registerLanguageChangeListener: () => () => {},
      t: fallbackT,
      getErrorMessage: (err) => getErrorMessage(err, fallbackT, 'vi'),
      getDeviceDisplayName: (devId, fallback) => getDeviceDisplayName(devId, fallbackT, fallback),
      isVietnamese: true,
      isEnglish: false
    };
  }
  return ctx;
}
