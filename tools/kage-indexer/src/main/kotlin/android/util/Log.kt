package android.util

/** The providers log with Android's Log; on GitHub it goes to the console. */
object Log {
    @JvmStatic fun d(tag: String?, msg: String?): Int { println("D/$tag: $msg"); return 0 }
    @JvmStatic fun i(tag: String?, msg: String?): Int { println("I/$tag: $msg"); return 0 }
    @JvmStatic fun w(tag: String?, msg: String?): Int { println("W/$tag: $msg"); return 0 }
    @JvmStatic fun w(tag: String?, msg: String?, t: Throwable?): Int { println("W/$tag: $msg $t"); return 0 }
    @JvmStatic fun e(tag: String?, msg: String?): Int { println("E/$tag: $msg"); return 0 }
    @JvmStatic fun e(tag: String?, msg: String?, t: Throwable?): Int { println("E/$tag: $msg $t"); return 0 }
    @JvmStatic fun v(tag: String?, msg: String?): Int = 0
}
