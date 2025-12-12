import AVFoundation
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
        if let fontDescriptor = MACaptionAppearanceCopyFontDescriptorForStyle(
            .user,
            nil,
            .default
        )?.takeRetainedValue() {
            // Get font name from descriptor
            if let fontName = fontDescriptor.fontAttributes[.name] as? String {
                styleDict[kCMTextMarkupAttribute_BaseFontFamilyName as String] = fontName
            }
        }
        
        // 2. Font Size (relative size)
        let relativeFontSize = MACaptionAppearanceGetRelativeCharacterSize(.user, nil)
        if relativeFontSize != 100 { // 100 is default (100%)
            // Convert percentage to a relative size factor
            let sizeFactor = relativeFontSize / 100.0
            styleDict[kCMTextMarkupAttribute_RelativeFontSize as String] = sizeFactor * 100
        }
        
        // 3. Foreground (Text) Color
        if let fgColor = MACaptionAppearanceCopyForegroundColor(.user, nil)?.takeRetainedValue() {
            let uiColor = UIColor(cgColor: fgColor)
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            
            styleDict[kCMTextMarkupAttribute_ForegroundColorARGB as String] = [alpha, red, green, blue]
        }
        
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
        if let bgColor = MACaptionAppearanceCopyBackgroundColor(.user, nil)?.takeRetainedValue() {
            let uiColor = UIColor(cgColor: bgColor)
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            
            styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] = [alpha, red, green, blue]
        }
        
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
        if let windowColor = MACaptionAppearanceCopyWindowColor(.user, nil)?.takeRetainedValue() {
            let uiColor = UIColor(cgColor: windowColor)
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            
            // Window opacity
            var windowOpacityBehavior: MACaptionAppearanceBehavior = .useValue
            let windowOpacity = MACaptionAppearanceGetWindowOpacity(.user, &windowOpacityBehavior)
            let finalAlpha = windowOpacityBehavior == .useValue ? windowOpacity : alpha
            
            // Note: There's no direct window color attribute in CMTextMarkup,
            // but we can use it as a fallback for background if background is not set
            if styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] == nil {
                styleDict[kCMTextMarkupAttribute_BackgroundColorARGB as String] = [finalAlpha, red, green, blue]
            }
        }
        
        // 8. Text Edge Style (outline, shadow, etc.)
        let textEdgeStyle = MACaptionAppearanceGetTextEdgeStyle(.user, nil)
        switch textEdgeStyle {
        case .none:
            break // No edge style
        case .raised:
            // Simulate raised effect with a light shadow
            styleDict[kCMTextMarkupAttribute_TextDecoration as String] = kCMTextMarkupTextDecoration_Underline
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
        if let fontDescriptor = MACaptionAppearanceCopyFontDescriptorForStyle(
            .user,
            nil,
            .default
        )?.takeRetainedValue() {
            let traits = fontDescriptor.symbolicTraits
            if traits.contains(.traitBold) {
                styleDict[kCMTextMarkupAttribute_BoldStyle as String] = true
            }
            if traits.contains(.traitItalic) {
                styleDict[kCMTextMarkupAttribute_ItalicStyle as String] = true
            }
        }
        
        // Only create style rule if we have any custom settings
        if !styleDict.isEmpty || hasCustomSettings {
            // Create a style rule that applies to all text (nil selector means apply to all)
            if let styleRule = AVTextStyleRule(textMarkupAttributes: styleDict) {
                styleRules.append(styleRule)
            }
            
            // If we have custom settings but empty dict, still return empty array
            // to indicate we should override defaults
            return styleRules.isEmpty && hasCustomSettings ? [] : styleRules
        }
        
        return nil
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
