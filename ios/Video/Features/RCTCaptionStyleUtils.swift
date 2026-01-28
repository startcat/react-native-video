import AVFoundation
import CoreMedia
import MediaAccessibility
import UIKit

// MARK: - RCTCaptionStyleUtils

/*!
 * Utility class to read system accessibility caption preferences
 * and apply them to AVPlayerItem when using AVPlayerLayer (controls = false)
 *
 * iOS applies caption styles automatically only when using AVPlayerViewController.
 * When using AVPlayerLayer, we need to manually read and apply the user's
 * accessibility preferences using MACaptionAppearance APIs.
 */
enum RCTCaptionStyleUtils {
    
    /// Creates an array of AVTextStyleRule based on the user's accessibility caption preferences
    /// - Returns: Array of AVTextStyleRule to apply to AVPlayerItem.textStyleRules, or nil if using system defaults
    static func createTextStyleRulesFromAccessibilitySettings() -> [AVTextStyleRule]? {
        var styleRules: [AVTextStyleRule] = []
        
        // Check if user has custom caption settings enabled
        // If the user hasn't customized anything, we return nil to use system defaults
        let hasCustomSettings = MACaptionAppearanceGetDisplayType(.user) != .automatic
        
        // Build style dictionary from accessibility preferences
        var styleDict: [String: Any] = [:]
        
        // 1. Font Style
        let fontDescriptorRef = MACaptionAppearanceCopyFontDescriptorForStyle(
            .user,
            nil,
            .default
        )
        let ctFontDescriptor = fontDescriptorRef.takeRetainedValue()
        // Get font family name from CTFontDescriptor
        if let fontFamilyName = CTFontDescriptorCopyAttribute(ctFontDescriptor, kCTFontFamilyNameAttribute) as? String {
            styleDict[kCMTextMarkupAttribute_FontFamilyName as String] = fontFamilyName
        }
        
        // 2. Font Size (relative size)
        let relativeFontSize = MACaptionAppearanceGetRelativeCharacterSize(.user, nil)
        if relativeFontSize != 100 { // 100 is default (100%)
            // Convert percentage to a relative size factor
            let sizeFactor = relativeFontSize / 100.0
            styleDict[kCMTextMarkupAttribute_RelativeFontSize as String] = sizeFactor * 100
        }
        
        // 3. Foreground (Text) Color
        let fgColorRef = MACaptionAppearanceCopyForegroundColor(.user, nil)
        let fgColor = fgColorRef.takeRetainedValue()
        let fgUIColor = UIColor(cgColor: fgColor)
        var fgRed: CGFloat = 0, fgGreen: CGFloat = 0, fgBlue: CGFloat = 0, fgAlpha: CGFloat = 0
        fgUIColor.getRed(&fgRed, green: &fgGreen, blue: &fgBlue, alpha: &fgAlpha)
        styleDict[kCMTextMarkupAttribute_ForegroundColorARGB as String] = [fgAlpha, fgRed, fgGreen, fgBlue]
        
        // 4. Foreground Opacity
        var fgOpacityBehavior: MACaptionAppearanceBehavior = .useValue
        let fgOpacity = MACaptionAppearanceGetForegroundOpacity(.user, &fgOpacityBehavior)
        if fgOpacityBehavior == .useValue && fgOpacity < 1.0 {
            // Apply opacity to foreground color if we have one
            if var colorArray = styleDict[kCMTextMarkupAttribute_ForegroundColorARGB as String] as? [CGFloat] {
                colorArray[0] = fgOpacity // Alpha is first element
                styleDict[kCMTextMarkupAttribute_ForegroundColorARGB as String] = colorArray
            }
        }
        
        // 5. Background Color
        let bgColorRef = MACaptionAppearanceCopyBackgroundColor(.user, nil)
        let bgColor = bgColorRef.takeRetainedValue()
        let bgUIColor = UIColor(cgColor: bgColor)
        var bgRed: CGFloat = 0, bgGreen: CGFloat = 0, bgBlue: CGFloat = 0, bgAlpha: CGFloat = 0
        bgUIColor.getRed(&bgRed, green: &bgGreen, blue: &bgBlue, alpha: &bgAlpha)
        styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] = [bgAlpha, bgRed, bgGreen, bgBlue]
        
        // 6. Background Opacity
        var bgOpacityBehavior: MACaptionAppearanceBehavior = .useValue
        let bgOpacity = MACaptionAppearanceGetBackgroundOpacity(.user, &bgOpacityBehavior)
        if bgOpacityBehavior == .useValue {
            if var colorArray = styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] as? [CGFloat] {
                colorArray[0] = bgOpacity
                styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] = colorArray
            }
        }
        
        // 7. Window Color (the box behind the text background)
        // Note: CMTextMarkup doesn't have a direct "window" color attribute like MACaptionAppearance.
        // The background color (kCMTextMarkupAttribute_BackgroundColorARGB) serves as the text highlight/box.
        // For a true "window" effect (larger box behind all text), we would need custom rendering.
        // However, we can check if user wants a window and apply it as an extended background.
        let windowColorRef = MACaptionAppearanceCopyWindowColor(.user, nil)
        let windowColor = windowColorRef.takeRetainedValue()
        let windowUIColor = UIColor(cgColor: windowColor)
        var windowRed: CGFloat = 0, windowGreen: CGFloat = 0, windowBlue: CGFloat = 0, windowAlpha: CGFloat = 0
        windowUIColor.getRed(&windowRed, green: &windowGreen, blue: &windowBlue, alpha: &windowAlpha)
        
        // Window opacity
        var windowOpacityBehavior: MACaptionAppearanceBehavior = .useValue
        let windowOpacity = MACaptionAppearanceGetWindowOpacity(.user, &windowOpacityBehavior)
        let finalWindowAlpha = windowOpacityBehavior == .useValue ? windowOpacity : windowAlpha
        
        // If window has opacity > 0 and background opacity is 0, use window color as background
        // This handles the case where user wants a window but no text background
        if finalWindowAlpha > 0 {
            if let bgColorArray = styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] as? [CGFloat],
               bgColorArray[0] == 0 { // Background alpha is 0
                // Use window color as background instead
                styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] = [finalWindowAlpha, windowRed, windowGreen, windowBlue]
            }
        }
        
        // 8. Text Edge Style (outline, shadow, etc.)
        let textEdgeStyle = MACaptionAppearanceGetTextEdgeStyle(.user, nil)
        switch textEdgeStyle {
        case .none:
            break // No edge style
        case .raised:
            // Simulate raised effect - no direct text decoration constant available
            // Using bold as a visual indicator instead
            styleDict[kCMTextMarkupAttribute_BoldStyle as String] = true
        case .depressed:
            // Simulate depressed effect
            break
        case .uniform:
            // Uniform outline - use bold
            styleDict[kCMTextMarkupAttribute_BoldStyle as String] = true
        case .dropShadow:
            // Drop shadow effect - no direct equivalent, but we can indicate it
            break
        @unknown default:
            break
        }
        
        // 9. Bold/Italic from font descriptor
        let symbolicTraits = CTFontDescriptorCopyAttribute(ctFontDescriptor, kCTFontSymbolicTrait) as? UInt32 ?? 0
        let traitsValue = CTFontSymbolicTraits(rawValue: symbolicTraits)
        if traitsValue.contains(.traitBold) {
            styleDict[kCMTextMarkupAttribute_BoldStyle as String] = true
        }
        if traitsValue.contains(.traitItalic) {
            styleDict[kCMTextMarkupAttribute_ItalicStyle as String] = true
        }
        
        // 10. Vertical Position - Position subtitles at 85% from top to avoid being cut off
        // This ensures subtitles stay within the safe area on devices with notch/Dynamic Island
        // Value is percentage from top: 0% = top, 100% = bottom
        // Using 85% to leave room for home indicator and ensure visibility
        styleDict[kCMTextMarkupAttribute_OrthogonalLinePositionPercentageRelativeToWritingDirection as String] = 85
        
        // Always create style rule to ensure vertical position is applied
        // This is critical for devices with notch/Dynamic Island where default positioning may cut off subtitles
        if let styleRule = AVTextStyleRule(textMarkupAttributes: styleDict) {
            styleRules.append(styleRule)
        }
        
        return styleRules.isEmpty ? nil : styleRules
    }
    
    /// Applies accessibility caption styles to an AVPlayerItem
    /// Call this after creating/setting the playerItem
    /// - Parameter playerItem: The AVPlayerItem to apply styles to
    static func applyAccessibilityCaptionStyles(to playerItem: AVPlayerItem?) {
        guard let playerItem = playerItem else { return }
        
        if let styleRules = createTextStyleRulesFromAccessibilitySettings() {
            playerItem.textStyleRules = styleRules
            debugPrint("[RCTCaptionStyleUtils] Applied \(styleRules.count) accessibility caption style rules")
        } else {
            // Clear any previously set rules to use system defaults
            playerItem.textStyleRules = nil
            debugPrint("[RCTCaptionStyleUtils] Using system default caption styles")
        }
    }
    
    /// Checks if the user has custom caption settings enabled in accessibility
    /// - Returns: true if user has customized caption appearance
    static func hasCustomCaptionSettings() -> Bool {
        return MACaptionAppearanceGetDisplayType(.user) != .automatic
    }
}
