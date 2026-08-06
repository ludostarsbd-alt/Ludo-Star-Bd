{pkgs}: {
  deps = [
    pkgs.temurin-bin-21
    pkgs.temurin-bin-17
    pkgs.jdk21
    pkgs.jdk17
    pkgs.openjdk21
    pkgs.openjdk17
    pkgs.android-tools
    pkgs.gradle
  ];
}
