package com.specialsoftwares.vyaamikkdiary.crashconsent

import org.junit.Assert.assertEquals
import org.junit.Test

/** Executes the production Kotlin queue policy. Does not certify SDK delivery. */
class CrashQueuePolicyTest {
  @Test fun unknownLegacyQueueIsNeverAuthorizedByNewGrant() {
    assertEquals("delete", crashQueueAction(true, null, "account-a:revision-7", true))
    assertEquals("delete", crashQueueAction(true, null, "account-a:revision-7", false))
  }
  @Test fun exactPriorOwnerAndRevisionMayDispatch() {
    assertEquals("send", crashQueueAction(true, "account-a:revision-7", "account-a:revision-7", false))
  }
  @Test fun anotherAccountOrNewerConsentCannotAdoptOldQueue() {
    assertEquals("delete", crashQueueAction(true, "account-a:revision-7", "account-b:revision-7", false))
    assertEquals("delete", crashQueueAction(true, "account-a:revision-7", "account-a:revision-9", false))
  }
  @Test fun withdrawalOrMixedOwnerQuarantineOverridesMatchingIdentity() {
    assertEquals("delete", crashQueueAction(true, "account-a:revision-7", "account-a:revision-7", true))
  }
  @Test fun emptyQueueDoesNotSendOrDelete() {
    assertEquals("empty", crashQueueAction(false, "account-a:revision-7", "account-b:revision-9", true))
  }
}
