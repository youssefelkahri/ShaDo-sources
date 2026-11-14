package android.util

/** Android's Base64 on the JVM (the flags the providers use). */
object Base64 {
    const val DEFAULT = 0
    const val NO_PADDING = 1
    const val NO_WRAP = 2
    const val URL_SAFE = 8
    @JvmStatic fun decode(s: String?, flags: Int): ByteArray {
        val t = s.orEmpty().trim().replace("\n", "").replace("\r", "")
        return if (flags and URL_SAFE != 0) java.util.Base64.getUrlDecoder().decode(t) else java.util.Base64.getMimeDecoder().decode(t)
    }
    @JvmStatic fun decode(b: ByteArray, flags: Int): ByteArray = decode(String(b), flags)
    @JvmStatic fun encodeToString(b: ByteArray, flags: Int): String {
        var enc = if (flags and URL_SAFE != 0) java.util.Base64.getUrlEncoder() else java.util.Base64.getEncoder()
        if (flags and NO_PADDING != 0) enc = enc.withoutPadding()
        return enc.encodeToString(b)
    }
    @JvmStatic fun encode(b: ByteArray, flags: Int): ByteArray = encodeToString(b, flags).toByteArray()
}
