const Store = require("electron-store");

const store = new Store({
  defaults: {
    settings: {
      // 일반 설정 (General)
      general: {
        enableTray: true, // 시스템 트레이 활성화
        autoStart: false, // 시스템 부팅 시 자동 시작
        enableAutoUpdate: true, // 자동 업데이트 활성화
        retryAttempts: 3, // 네트워크 재시도 횟수
      },
      // UI 설정 (User Interface)
      ui: {
        theme: "dark", // 테마 (dark, light, system)
        miniModeDefault: false, // 기본 미니 모드
        customTheme: {
          backgroundImage: "", // 배경 이미지 경로
          fontFamily: "Noto Sans KR", // 폰트
        },
        customColor: "#7289DA", // 사용자 정의 색상
        opacity: 1, // 창 투명도
        invert: false, // 색상 반전
        brightness: 1, // 밝기
        buttonStyle: "rounded", // 버튼 스타일
      },
      // 알림 설정 (Notifications)
      notifications: {
        enableNotifications: true, // 알림 활성화
        enableSound: true, // 알림 사운드 활성화
        notificationEvents: {
          home: true, // 홈 탭 알림
          chat: true, // 채팅 알림
        },
        notificationDevices: {}, // 장치별 알림 설정
      },
      // 네트워크 설정 (Network)
      network: {
        networkType: "local", // 네트워크 타입 (local, public)
        enableHamachi: false, // Hamachi 지원
        bandwidthLimit: 0, // 대역폭 제한 (KB/s, 0은 무제한)
      },
      // 파일 전송 설정 (File Transfer)
      fileTransfer: {
        autoReceive: false, // 자동 파일 수신
        autoSavePath: "./Received", // 자동 저장 경로
        compressFiles: false, // 파일 압축
        convertFiles: false, // 파일 변환
        convertTo: "jpg", // 변환 포맷
        chunkedTransfer: false, // 청크 전송
      },
      // 단축키 설정 (Shortcuts)
      shortcuts: {
        fileShare: "Ctrl+Shift+F", // 파일 공유 단축키
        chatSend: "Ctrl+Enter", // 채팅 전송 단축키
      },
      // 사용자 프로필 (User Profile)
      userProfile: {
        name: "User", // 사용자 이름
        icon: "", // 프로필 아이콘 경로
      },
      // 기타 설정 (Miscellaneous)
      miscellaneous: {
        lowPowerMode: false, // 저전력 모드
        deviceGroups: [], // 장치 그룹
      },
    },
    // 데이터 기록
    history: [], // 전송 기록
    updateHistory: [], // 업데이트 기록
    usageStats: [], // 사용 통계
    activityLogs: [], // 활동 로그
    speedTests: [], // 속도 테스트
    encryptionKeys: {}, // 암호화 키
  },
});

module.exports = store;