# typed: false
# frozen_string_literal: true

# Homebrew formula for remb
# Tap: brew tap useremb/remb
# Install: brew install remb
#
# To publish this tap:
#   1. Create a repo: github.com/useremb/homebrew-remb
#   2. Add this file as Formula/remb.rb
#   3. Update the sha256 hashes after each release (run: shasum -a 256 <binary>)
class Remb < Formula
  desc "Persistent memory layer for AI coding sessions"
  homepage "https://useremb.com"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/useremb/remb/releases/download/v#{version}/remb-darwin-arm64"
      sha256 "REPLACE_WITH_SHA256_OF_remb-darwin-arm64"
    end
    on_intel do
      url "https://github.com/useremb/remb/releases/download/v#{version}/remb-darwin-amd64"
      sha256 "REPLACE_WITH_SHA256_OF_remb-darwin-amd64"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/useremb/remb/releases/download/v#{version}/remb-linux-arm64"
      sha256 "REPLACE_WITH_SHA256_OF_remb-linux-arm64"
    end
    on_intel do
      url "https://github.com/useremb/remb/releases/download/v#{version}/remb-linux-amd64"
      sha256 "REPLACE_WITH_SHA256_OF_remb-linux-amd64"
    end
  end

  def install
    bin.install Dir["remb*"].first => "remb"
  end

  test do
    assert_match "remb v#{version}", shell_output("#{bin}/remb --version")
  end
end
